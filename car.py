class Car:
    """
    Represents a car in the simulation, holding its performance attributes.
    """
    def __init__(self, base_lap_time: float, fuel_effect: float = 0.05, pace_delta: float = 0.0):
        """
        Initializes a Car object.
        :param base_lap_time: The car's ideal lap time on fresh tires and low fuel (in seconds).
        :param fuel_effect: Time benefit per lap as fuel burns off (in seconds).
        :param pace_delta: A car-specific time delta per lap compared to the fastest car.
        """
        self.base_lap_time = base_lap_time
        self.fuel_effect = fuel_effect
        self.pace_delta = pace_delta