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
2.  **Install Flask:**
    ```bash
    pip install Flask
    ```

### Running the Application

1.  **Ensure your file structure is correct:**
    ```
    F1/
    ├── app.py
    ├── style.css
    ├── README.md
    └── templates/
        └── index.html
    ```
    (Make sure `index.html` is inside a `templates` folder, and `style.css` will be in a `static` folder if you follow Flask's convention, or directly in `F1` if you adjust `app.py` to serve it from there. Your current `index.html` expects `style.css` in `static`.)

2.  **Run the Flask application:**
    ```bash
    python app.py
    ```

3.  **Access the application:**
    Open your web browser and go to `http://127.0.0.1:5000/`.

## Usage

*   Enter the desired number of laps for the race.
*   Specify the pit stop lap for Strategy 1 and Strategy 2.
*   Click "Run Simulation" to see the simulated race results, including total times, pit events, and potential safety car deployments.
