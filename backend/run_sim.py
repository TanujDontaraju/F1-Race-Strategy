import argparse
import pandas as pd
from car import Car
from driver import Driver
from strategy import Strategy
from simulation_engine import SimulationEngine

def main():
    """Main function to run the simulation from the command line."""
    # --- Simulation Parameters ---
    # These would eventually come from data analysis (e.g., using fastf1)
    BAHRAIN_LAP_TIME = 92.5  # Approximate pole time in seconds
    TIRE_COMPOUNDS = {
        "SOFT": {"degradation": 0.25, "offset": -0.5},
        "MEDIUM": {"degradation": 0.15, "offset": 0.0},
        "HARD": {"degradation": 0.08, "offset": 0.7},
    }
    
    # Define a simple one-stop strategy
    # Start on MEDIUM, pit on lap 28 for HARD
    one_stop_strategy = Strategy(pit_stops=[28], tire_sequence=['MEDIUM', 'HARD'])
    
    # Create the simulation objects
    car = Car(base_lap_time=BAHRAIN_LAP_TIME)
    driver = Driver(name="VER")
    
    # Initialize and run the simulation engine
    simulator = SimulationEngine(total_laps=57, car=car, driver=driver)
    results = simulator.run_simulation(strategy=one_stop_strategy, tire_compounds=TIRE_COMPOUNDS)
    
    # Output results to a CSV
    df = pd.DataFrame(results)
    output_filename = "race_simulation_output.csv"
    df.to_csv(output_filename, index=False)
    
    print(f"Simulation complete. Results saved to {output_filename}")

if __name__ == "__main__":
    main()