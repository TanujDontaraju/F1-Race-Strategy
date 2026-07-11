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
    cd F1
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

1.  **Run the Streamlit application from your terminal:**
    ```
    streamlit run app.py
    ```
2.  **Access the application:**
    A new tab should open in your web browser with the application. If not, open your browser and go to the local URL displayed in your terminal (usually `http://localhost:8501`).

## Usage

*   The application will start with an intro animation. Click "Enter the Pit Lane" to proceed.
*   Use the sidebar to select the race season and a specific Grand Prix from that season.
*   Adjust global parameters like the fastest car's pace and pit stop time loss.
*   In the main area, select a driver.
*   Define a strategy by entering the pit stop laps (e.g., `15, 40`).
*   Choose the tire compound for the starting stint and each subsequent stint.
*   Click "Simulate Race Strategy" to view the results, including total race time and a lap time chart.
