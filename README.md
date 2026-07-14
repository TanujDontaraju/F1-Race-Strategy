AI Race Strategy Simulator (In Progress)
Python, Data Modeling, Simulation Systems
• Developing a data-driven simulation system to model Formula 1 race outcomes using historical lap
times, tire degradation, and track-specific variables.
• Building a lap-by-lap simulation engine incorporating probabilistic events such as pit strategies, safety
cars, and performance variability.
• Designing a strategy optimization module to evaluate and compare multiple race strategies (e.g.,
undercut vs overcut).

## Setup and Run Instructions
To get this project up and running on your local machine, follow these steps:

### Prerequisites

Make sure you have Python 3.x installed.

### Installation

1.  **Clone the repository (if applicable) or navigate to your project directory:**
    ```bash
    cd path/to/F1
    ```
2.  **(Optional but Recommended) Create and activate a virtual environment:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
    ```
3.  **Install the required packages from `requirements.txt`:**
    ```bash
    pip install -r requirements.txt
    ```

### Running the Application

1.  **Run the Streamlit application using Python's module flag:**
    This is the most reliable method, especially if you are not using a virtual environment.
    ```bash
    python -m streamlit run app.py
    ```

2.  **Access the application:**
    Open your web browser and go to the URL provided in your terminal (usually `http://localhost:8501`).

## Usage

*   Use the sidebar to select the **Season** and **Grand Prix**.
*   Adjust the base **Fastest Car Pace** and **Pit Stop Time Loss** if desired.
*   In the main area, select a **Driver** from the dropdown menu.
*   Define the race strategy by entering the **Pit Stop Laps** (e.g., `15, 40`).
*   Choose the **Tire Compound** for the start and for each subsequent stint.
*   Click **Simulate Race Strategy** to view the results, including total race time, a lap time chart, and detailed lap-by-lap data.
