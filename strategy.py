class Strategy:
    """
    Defines the race strategy, including pit stops and the sequence of tire compounds.
    """
    def __init__(self, pit_stops: list[int], tire_sequence: list[str], pit_stop_loss: float = 21.0):
        """
        Initializes a Strategy object.
        :param pit_stops: A list of lap numbers on which to pit.
        :param tire_sequence: A list of tire compound names for each stint (e.g., ['MEDIUM', 'HARD']).
        :param pit_stop_loss: The total time lost during a pit stop (in seconds).
        """
        self.pit_stops = pit_stops
        self.tire_sequence = tire_sequence
        self.pit_stop_loss = pit_stop_loss