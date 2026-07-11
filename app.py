import streamlit as st
import pandas as pd
import fastf1
import os
import datetime
from car import Car
from driver import Driver
from strategy import Strategy
from simulation_engine import SimulationEngine

# --- Page Configuration ---
st.set_page_config(page_title="F1 Race Engineer", layout="wide")

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
        session.load()

        # Get driver list {Abbr, FullName, TeamName}
        laps = session.laps
        drivers_data = []
        driver_numbers = laps['DriverNumber'].unique()
        for num in driver_numbers:
            driver_info = laps[laps['DriverNumber'] == num].iloc[0]
            drivers_data.append({
                'Abbr': driver_info['Driver'],
                'FullName': driver_info['FullName'],
                'TeamName': driver_info['Team']
            })
        drivers_data = sorted(drivers_data, key=lambda x: (x['TeamName'], x['FullName']))

        # Calculate team pace deltas
        fastest_lap = laps['LapTime'].min()
        laps = laps.loc[laps['LapTime'] < fastest_lap * 1.08] # Filter out slow/anomaly laps
        team_pace = laps.groupby('Team')['LapTime'].median().apply(lambda x: x.total_seconds())
        fastest_team_pace = team_pace.min()
        team_deltas = (team_pace - fastest_team_pace).to_dict()

        return {
            "total_laps": session.total_laps,
            "drivers": drivers_data,
            "team_pace": team_deltas
        }
    except Exception as e:
        # Handle cases where session data might not be available (e.g., very old seasons)
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
    race_calendar = {event['EventName']: event['RoundNumber'] for index, event in schedule.iterrows() if event['EventName']}
    
    if not race_calendar:
        st.sidebar.warning(f"No calendar data found for {selected_year}.")
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