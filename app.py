import streamlit as st
import pandas as pd
import fastf1
import os
import datetime
import base64
from car import Car
from driver import Driver
from strategy import Strategy
from simulation_engine import SimulationEngine

# --- Page Configuration ---
st.set_page_config(page_title="F1 Race Engineer", layout="wide")

# --- Global Styles ---
# Hide Streamlit's default header and footer for a cleaner look
st.markdown("""
    <style>
        header[data-testid="stHeader"] {display: none;}
        footer {display: none;}
    </style>
""", unsafe_allow_html=True)

def show_intro():
    """Displays an introductory screen with an F1 logo animation."""
    # --- Define paths for the logo files ---
    script_dir = os.path.dirname(os.path.abspath(__file__))
    assets = {
        "logo": os.path.join(script_dir, "F1 Logo (Red).png"),
        "intro_html": os.path.join(script_dir, "intro.html"),
        "lights_sound": os.path.join(script_dir, "F1 Starting light sound.mp3"),
        "engine_sound": os.path.join(script_dir, "Car Start.mp3")
    }

    # --- Check for asset files before starting ---
    # The logo and HTML are required. Audio is an optional enhancement.
    if not os.path.exists(assets["logo"]) or not os.path.exists(assets["intro_html"]):
        st.error("Error: Missing critical asset file(s) (`F1 Logo (Red).png` or `intro.html`).")
        st.stop()

    # --- Prepare and render the HTML animation ---
    def get_file_as_base64(path):
        if not os.path.exists(path):
            return ""
        with open(path, "rb") as f:
            data = f.read()
        return base64.b64encode(data).decode()

    logo_base64 = get_file_as_base64(assets["logo"])
    lights_sound_base64 = get_file_as_base64(assets["lights_sound"])
    engine_base64 = get_file_as_base64(assets["engine_sound"])

    lights_sound_src = f"data:audio/mpeg;base64,{lights_sound_base64}" if lights_sound_base64 else ""
    engine_src = f"data:audio/mpeg;base64,{engine_base64}" if engine_base64 else ""

    with open(assets["intro_html"], "r") as f:
        html_template = f.read()
    
    final_html = html_template.replace("{{LOGO_SRC}}", f"data:image/png;base64,{logo_base64}") \
                              .replace("{{LIGHTS_SOUND_SRC}}", lights_sound_src) \
                              .replace("{{ENGINE_SRC}}", engine_src)

    st.markdown("""
        <style>
        /* Prevent scrolling on the intro page */
        html { overflow-y: hidden !important; }
        .stApp { background-color: #000000; }

        /* Force the iframe containing the intro animation to fill the viewport */
        iframe {
            height: 100vh !important;
            width: 100vw !important;
            position: fixed; /* Pin it to the viewport */
            top: 0;
            left: 0;
            border: none; /* Remove default iframe border */
        }
        
        /* Directly style the button's container for robust positioning and animation */
        div[data-testid="stButton"] {
            position: fixed !important;
            top: 65%; /* Position under the centered logo */
            left: 50%;
            transform: translateX(-50%);
            width: auto !important; /* Override Streamlit's default width */
            z-index: 10;

            /* Animation for fade-in */
            opacity: 0;
            animation: fadeIn 1s ease-in-out 6s forwards; /* Sync with logo fade-in */
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        div[data-testid="stButton"] > button {
            background-color: transparent;
            color: #E10600; /* F1 Red */
            border: 2px solid #E10600;
            border-radius: 30px; /* Make it more rounded */
            font-weight: bold;
            text-transform: uppercase;
            padding: 10px 24px;
            transition: all 0.3s ease-in-out;
        }

        div[data-testid="stButton"] > button:hover {
            background-color: #E10600;
            color: #FFFFFF;
            border-color: #E10600;
            box-shadow: 0 0 20px #E10600;
            transform: scale(1.05);
        }
        </style>
    """, unsafe_allow_html=True)

    # Render the HTML component with the animation
    st.components.v1.html(final_html)

    # The button is now positioned and animated entirely via the CSS above
    if st.button("Enter the Pit Lane"):
        st.session_state.intro_complete = True
        # Reset styles for the main app to prevent them from carrying over
        st.markdown("""
            <style>
            .stApp { background: none; }
            iframe {
                height: auto !important; width: auto !important;
                position: static; top: auto; left: auto;
                border: 1px solid #e6e6e6;
            }
            div[data-testid="stButton"] { position: static !important; transform: none; }
            html { overflow-y: auto !important; }
            </style>
        """, unsafe_allow_html=True)
        st.rerun()

def main_app():
    # --- Main Title ---
    st.title("F1 Race Engineer Strategy Tool")

    # --- Enable fastf1 cache ---
    CACHE_DIR = 'cache'
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)

    fastf1.Cache.enable_cache(CACHE_DIR)

    # --- Core Parameters ---
    # Define tire characteristics (Degradation per lap, and Performance offset from Medium)
    TIRE_COMPOUNDS = {
        "SOFT": {"degradation": 0.25, "offset": -0.5},
        "MEDIUM": {"degradation": 0.15, "offset": 0.0},
        "HARD": {"degradation": 0.08, "offset": 0.7},
        "INTERMEDIATE": {"degradation": 0.20, "offset": 4.0},
        "WET": {"degradation": 0.18, "offset": 9.0},
    }

    # --- Caching for fastf1 data ---
    @st.cache_data(ttl="1d")
    def get_session_details(year, event_name):
        """
        Gets session details: total laps, driver list, and team pace deltas.
        Returns a dictionary with 'total_laps', 'drivers', and 'team_pace'.
        """
        try:
            session = fastf1.get_session(year, event_name, 'R')
            # Load all data except for telemetry, which is bulky and can be problematic for older seasons
            session.load(telemetry=False, weather=False, messages=False)

            # Now that data should be loaded, extract driver info.
            drivers_data = []
            # The session.results property is the most reliable source for FullName if available
            if hasattr(session, 'results') and not session.results.empty:
                for row in session.results.itertuples():
                    drivers_data.append({
                        'Abbr': row.Abbreviation,
                        'FullName': row.FullName,
                        'TeamName': row.TeamName
                    })
            # If session.results is not available (common in older seasons), fall back to laps
            else:
                driver_numbers = session.laps['DriverNumber'].unique()
                for drv_num in driver_numbers:
                    driver_laps = session.laps.pick_driver(drv_num)
                    if not driver_laps.empty:
                        driver_info = driver_laps.iloc[0]
                        # Use .get() to safely access 'FullName', falling back to the abbreviation
                        full_name = driver_info.get('FullName', driver_info['Driver'])
                        drivers_data.append({
                            'Abbr': driver_info['Driver'],
                            'FullName': full_name,
                            'TeamName': driver_info['Team']
                        })

            if not drivers_data:
                raise ValueError("Could not extract any driver data from the session.")

            drivers_data = sorted(drivers_data, key=lambda x: (x['TeamName'], x['FullName']))

            # Calculate team pace deltas
            laps = session.laps
            quick_laps = laps.pick_quicklaps()

            if quick_laps.empty:
                # Handle races with no representative laps (e.g., very wet or short)
                team_deltas = {d['TeamName']: 0.0 for d in drivers_data}
            else:
                team_pace = quick_laps.groupby('Team')['LapTime'].median().apply(lambda x: x.total_seconds())
                fastest_team_pace = team_pace.min()
                team_deltas = (team_pace - fastest_team_pace).to_dict()

            return {
                "total_laps": session.total_laps,
                "drivers": drivers_data,
                "team_pace": team_deltas
            }
        except Exception as e:
            st.warning(f"Could not load full session data for {year} {event_name}. Using defaults. Error: {e}")
            return {
                "total_laps": 55,
                "drivers": [{"Abbr": "VER", "FullName": "Max Verstappen", "TeamName": "Red Bull Racing"}],
                "team_pace": {"Red Bull Racing": 0.0}
            }

    # --- Sidebar for Global Inputs ---
    st.sidebar.header("Race Settings")
    current_year = datetime.date.today().year
    selected_year = st.sidebar.selectbox("Select Season", range(current_year, 1949, -1))

    try:
        schedule = fastf1.get_event_schedule(selected_year, include_testing=False)

        # Filter schedule to only include events that have already happened
        today = datetime.date.today()
        past_events_schedule = schedule[schedule['EventDate'].dt.date < today]

        race_calendar = {event['EventName']: event['RoundNumber'] for index, event in past_events_schedule.iterrows() if event['EventName']}
        
        if not race_calendar:
            st.sidebar.warning(f"No past races found in {selected_year} to analyze.")
            st.stop()

        selected_event_name = st.sidebar.selectbox("Select Grand Prix", race_calendar.keys())
        
        session_details = get_session_details(selected_year, selected_event_name)
        total_laps = session_details['total_laps']
        drivers_list = session_details['drivers']
        team_pace_deltas = session_details['team_pace']

        base_lap_time = st.sidebar.number_input("Fastest Car Pace (on Mediums, seconds)", value=90.0, format="%.2f")
        pit_stop_loss = st.sidebar.number_input("Pit Stop Time Loss (seconds)", value=21.0, format="%.1f")

    except Exception as e:
        st.sidebar.error(f"An error occurred fetching race data: {e}")
        st.stop()

    # --- Main Area for Strategy Definition ---
    st.header("Define Your Strategy")

    driver_options = [f"{d['FullName']} ({d['Abbr']})" for d in drivers_list]
    selected_driver_str = st.selectbox("Select Driver", driver_options)

    pit_stops_input = st.text_input("Pit Stop Laps (comma-separated, e.g., 15, 40)", "28")

    num_pits = len(pit_stops_input.split(',')) if pit_stops_input.strip() else 0
    tire_sequence = []
    st.subheader("Tire Stint Plan")
    tire_sequence.append(st.selectbox("Start Tire", TIRE_COMPOUNDS.keys(), index=1)) # Default to MEDIUM
    for i in range(num_pits):
        tire_sequence.append(st.selectbox(f"Stint {i+2} Tire", TIRE_COMPOUNDS.keys(), index=2, key=f"stint_{i+1}")) # Default to HARD

    # --- Simulation Execution ---
    if st.button("Simulate Race Strategy"):
        try:
            # --- Process and Run Strategy ---
            pit_stop_laps = [int(lap.strip()) for lap in pit_stops_input.split(',') if lap.strip()]
            
            # Validate that the number of tires matches the number of stints
            if len(tire_sequence) != (len(pit_stop_laps) + 1):
                st.error("The number of tire choices must match the number of stints (number of pit stops + 1).")
            else:
                # Find selected driver's details
                selected_driver_abbr = selected_driver_str.split('(')[-1][:-1]
                driver_details = next((d for d in drivers_list if d['Abbr'] == selected_driver_abbr), None)
                driver_name = driver_details['Abbr'] if driver_details else "DRIVER"
                team_name = driver_details['TeamName'] if driver_details else "TEAM"
                
                # Get the pace delta for the car
                pace_delta = team_pace_deltas.get(team_name, 0.0)

                strategy = Strategy(pit_stops=pit_stop_laps, tire_sequence=tire_sequence, pit_stop_loss=pit_stop_loss)
                car = Car(base_lap_time=base_lap_time, pace_delta=pace_delta)
                driver = Driver(name=driver_name)
                simulator = SimulationEngine(total_laps=total_laps, car=car, driver=driver)
                results = simulator.run_simulation(strategy, TIRE_COMPOUNDS)
                
                # --- Display Results ---
                results_df = pd.DataFrame(results)
                
                st.header(f"Simulated Race Results for {driver_name} at {selected_event_name}")
                
                total_race_time_seconds = results_df['lap_time'].sum()
                minutes = int(total_race_time_seconds // 60)
                seconds = total_race_time_seconds % 60
                
                col1, col2 = st.columns(2)
                col1.metric(label="Total Race Time", value=f"{minutes}m {seconds:.2f}s")
                col2.metric(label=f"{team_name} Pace Delta", value=f"+{pace_delta:.3f}s / lap")

                st.subheader("Lap Time Chart")
                st.line_chart(results_df.set_index('lap_number')['lap_time'])

                st.subheader("Race Data")
                st.dataframe(results_df)

        except Exception as e:
            st.error(f"An error occurred during simulation: {e}")
    else:
        st.info("Configure your strategy above and click 'Simulate Race Strategy'.")

# --- App Execution ---
if 'intro_complete' not in st.session_state:
    st.session_state.intro_complete = False

if not st.session_state.intro_complete:
    show_intro()
else:
    main_app()