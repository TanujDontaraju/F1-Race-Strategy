from car import Car
from driver import Driver
from strategy import Strategy

class SimulationEngine:
    """
    The main engine for running the lap-by-lap race simulation.
    """
    def __init__(self, total_laps: int, car: Car, driver: Driver):
        self.total_laps = total_laps
        self.car = car
        self.driver = driver

    def run_simulation(self, strategy: Strategy, tire_compounds: dict):
        """
        Runs the full race simulation and returns the results.
        :param strategy: The Strategy object defining pit stops and tire choices.
        :param tire_compounds: A dictionary defining the properties of available tires.
        :return: A list of dictionaries, where each dictionary contains details for a lap.
        """
        lap_data = []
        tire_age = 0
        stint_index = 0
        current_tire_name = strategy.tire_sequence[stint_index]
        
        for lap in range(1, self.total_laps + 1):
            tire_age += 1
            
            current_tire = tire_compounds[current_tire_name]

            # Calculate performance effects
            degradation_effect = tire_age * current_tire['degradation']
            fuel_correction = (self.total_laps - lap) * self.car.fuel_effect
            tire_performance_offset = current_tire['offset']
            
            # Base lap time calculation
            lap_time = self.car.base_lap_time + self.car.pace_delta + degradation_effect - fuel_correction + tire_performance_offset
            
            # Handle pit stops
            is_pit_stop = lap in strategy.pit_stops
            if is_pit_stop:
                lap_time += strategy.pit_stop_loss

            lap_data.append({
                "lap_number": lap,
                "lap_time": lap_time,
                "tire_age": tire_age,
                "is_pit_stop": is_pit_stop,
                "tire_compound": current_tire_name
            })

            if is_pit_stop:
                tire_age = 0  # Reset tire age for the next lap
                stint_index += 1
                if stint_index < len(strategy.tire_sequence):
                    current_tire_name = strategy.tire_sequence[stint_index]
            
        return lap_data