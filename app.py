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
        "intro_css": os.path.join(script_dir, "intro.css"),
    }

    # --- Check for asset files before starting ---
    # The logo, HTML, and CSS are required. Audio is an optional enhancement.
    if not all(os.path.exists(assets[key]) for key in ["logo", "intro_html", "intro_css"]):
        st.error("Error: Missing critical asset file(s) (`F1 Logo (Red).png`, `intro.html`, or `intro.css`).")
        st.stop()

    # --- Prepare and render the HTML animation ---
    def get_file_as_base64(path):
        """Reads a file and returns its base64 encoded version."""
        if not os.path.exists(path):
            return ""
        with open(path, "rb") as f:
            data = f.read()
        return base64.b64encode(data).decode()

    logo_base64 = get_file_as_base64(assets["logo"])

    # Read the CSS file content
    with open(assets["intro_css"], "r") as f:
        css_styles = f.read()

    with open(assets["intro_html"], "r") as f:
        html_template = f.read()
    # Inject the CSS and logo into the HTML template
    final_html = html_template.replace("{{CSS_STYLES}}", css_styles) \
                              .replace("{{LOGO_SRC}}", f"data:image/png;base64,{logo_base64}")
    # Render the HTML component with the animation.
    # Passing an explicit height + scrolling=False as a fallback in case the
    # CSS above hasn't painted yet on first render.
    st.components.v1.html(final_html, height=800, scrolling=False)

    if st.button("Enter the Pit Lane"):
        st.session_state.intro_complete = True
        # The CSS reset logic has been moved to the main app's rendering block
        # for better control. This simply triggers the state change and rerun.
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

        NOTE: FastF1's lap-by-lap timing data (laps, tire compounds, pit
        stops, pace) is sourced from the F1 live-timing API, which only has
        coverage from 2018 onward. Seasons before that will load a Session
        object fine, but session.laps will be empty/unusable, which is why
        this function -- and the sidebar season selector -- restrict
        analysis to EARLIEST_SUPPORTED_YEAR and later.
        """
        try:
            session = fastf1.get_session(year, event_name, 'R')
            # Load all data except for telemetry, which is bulky and can be problematic for older seasons
            session.load(telemetry=False, weather=False, messages=False)
        except Exception as e:
            st.warning(f"Could not load session data for {year} {event_name}. FastF1 may not have data for this event. Error: {e}")
            return {
                "total_laps": 0,
                "drivers": [],
                "team_pace": {}
            }

        # Explicitly check FastF1's own flag for whether this session has
        # live-timing (lap-level) data available, rather than letting a
        # missing-data error surface later when we try to read session.laps.
        if not getattr(session, 'f1_api_support', True):
            st.warning(
                f"{year} {event_name} predates FastF1's detailed timing data "
                f"(available from {EARLIEST_SUPPORTED_YEAR} onward). Lap times, "
                f"tire stints, and pit stops aren't available for this season, "
                f"so strategy simulation can't be run."
            )
            return {"total_laps": 0, "drivers": [], "team_pace": {}}

        drivers_data = []
        try:
            # For modern seasons (approx. 2018+), session.results is well-structured.
            # For older seasons, it may be missing columns (like 'FullName'), causing errors.
            # This try/except block attempts to use the modern structure and falls back to a more
            # robust method for older data.
            try:
                if not hasattr(session, 'results') or session.results.empty:
                    raise ValueError("No session.results found, using fallback.")

                for row in session.results.itertuples():
                    drivers_data.append({
                        'Abbr': row.Abbreviation,
                        'FullName': row.FullName,
                        'TeamName': row.TeamName
                    })
                if not drivers_data:
                    raise ValueError("Results were empty, using fallback.")
            except (AttributeError, ValueError):
                # Fallback for older seasons: Use lap data, which is more consistent.
                drivers_data = []  # Ensure list is clean before filling
                if hasattr(session, 'laps') and not session.laps.empty and 'Driver' in session.laps.columns:
                    driver_abbreviations = session.laps['Driver'].unique()
                    for drv_abbr in driver_abbreviations:
                        driver_laps = session.laps.pick_driver(drv_abbr)
                        if not driver_laps.empty:
                            driver_info = driver_laps.iloc[0]
                            # Safely get required info
                            abbr = driver_info.get('Driver')
                            team = driver_info.get('Team')
                            if abbr and team:
                                full_name = driver_info.get('FullName', abbr)
                                drivers_data.append({
                                    'Abbr': abbr,
                                    'FullName': full_name,
                                    'TeamName': team
                                })

            if not drivers_data:
                st.warning(f"Could not extract any driver data for {year} {event_name}. The data may be incomplete.")
                return {"total_laps": getattr(session, 'total_laps', 55), "drivers": [], "team_pace": {}}

            drivers_data = sorted(drivers_data, key=lambda x: (x['TeamName'], x['FullName']))

            # Calculate team pace deltas
            laps = session.laps
            if laps.empty:
                team_deltas = {d['TeamName']: 0.0 for d in drivers_data}
            else:
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
            st.error(f"An unexpected error occurred while processing session details: {e}")
            return {"total_laps": 0, "drivers": [], "team_pace": {}}

    # --- Sidebar for Global Inputs ---
    # FastF1's detailed timing data is available from 2018 onward.
    EARLIEST_SUPPORTED_YEAR = 2018

    st.sidebar.header("Race Settings")
    current_year = datetime.date.today().year
    # Only 2018+ seasons have the F1 live-timing data FastF1 needs for lap
    # times, tire stints, and pit stops. Earlier seasons are excluded here
    # rather than allowed to fail deeper in the pipeline.
    selected_year = st.sidebar.selectbox(
        "Select Season", range(current_year, EARLIEST_SUPPORTED_YEAR - 1, -1)
    )
    st.sidebar.caption(
        f"Detailed timing data is only available from FastF1 for "
        f"{EARLIEST_SUPPORTED_YEAR} onward, so earlier seasons aren't listed."
    )

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

        if not session_details.get("drivers"):
            st.error(f"No driver data could be loaded for {selected_event_name} {selected_year}. Please select another event.")
            st.stop()

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