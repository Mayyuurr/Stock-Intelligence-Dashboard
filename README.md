# Jarnox Stock Intelligence Dashboard 📈

A comprehensive financial data pipeline and modern visual dashboard designed as part of the Jarnox Internship Assignment. This full-stack application dynamically fetches historical stock data, calculates key financial metrics, employs Machine Learning for short-term price prediction, and visualizes everything via a sleek "Glassmorphism" frontend interface.

## 🚀 Key Features

### Backend (FastAPI & Data Engine)
- **Live Data Fetching**: Retrieves the latest stock metrics automatically via `yfinance`.
- **Pre-processing**: Handles robust data cleaning, missing value imputation (forward fill), and formatting.
- **Advanced Financial Metrics**: Automatically calculates:
  - Daily Return Percentages
  - 7-Day Moving Averages
  - 52-Week High and Low marks
  - **30-Day Annualized Volatility** (to estimate risk profiles)
- **AI Price Prediction**: Integrates `scikit-learn`'s Simple Linear Regression model to forecast closing prices 3 days into the future based on recent 30-day trends.
- **Robust REST API Core**: Features endpoints for `/search`, `/companies`, `/predict`, `/summary`, and `/data`.

### Frontend (HTML/CSS/JS)
- **Modern "Glassmorphism" UI**: Built from scratch using pure CSS (no bloated frameworks). Features translucent frosted-glass cards, deep space linear-gradients, fluid animations, and custom WebKit scrollbars.
- **Dynamic Search**: Instant search functionality with dropdown-autocomplete suggestions.
- **Interactive Visualizations**: Powered by **Chart.js**. The interactive line chart smoothly stitches together historical data with the dashed AI prediction line.
- **Market Leaders Panel**: Quick one-click loading of popular tickers like `AAPL`, `MSFT`, `RELIANCE.NS`, etc.

---

## 🛠️ Tech Stack
- **Python 3.14.2**
- **FastAPI** (High-performance API framework)
- **Uvicorn** (ASGI Python server)
- **Pandas & NumPy** (Data processing & math)
- **Scikit-Learn** (Machine Learning/Regression)
- **yfinance** (Stock data provider)
- **Chart.js** (Frontend charting visualization)
- **Vanilla CSS/JS** (Custom styling and dynamic DOM updates)

---

## ⚙️ Installation & Usage

### 1. Set up the Environment
It is recommended to use the generated virtual environment to install all dependencies specified in `requirements.txt`.
```bash
# Activate the virtual environment
# On Windows:
.\venv\Scripts\activate

# Install dependencies (pandas, fastapi, yfinance, scikit-learn, etc.)
pip install -r requirements.txt
```

### 2. Start the FastAPI Backend
Launch the server using uvicorn:
```bash
uvicorn main:app --reload
```
*The API will start running on `http://127.0.0.1:8000`.*
*You can view the auto-generated Swagger UI documentation at `http://127.0.0.1:8000/docs`.*

### 3. Open the Frontend Dashboard
Navigate to the `frontend/` folder and open the `index.html` file in any modern web browser (Edge, Chrome, Safari). 

*Tip: No Node.js or frontend bundler is required. It just works!*

---

## 📡 API Reference

- `GET /companies` : Returns a list of the available market leader stock symbols.
- `GET /search/{symbol}` : Searches for a given ticker and returns its most recent close, open, return, MA, volatility, and 52-week summary.
- `GET /summary/{symbol}` : Returns specific 52-week highs, lows, and average closing numbers.
- `GET /data/{symbol}` : Returns 30-day historical trading history suitable for graphing.
- `GET /predict/{symbol}` : Trains a linear regression model on the last 30 days and projects prices for `T+1`, `T+2`, and `T+3`.
- `GET /compare?symbol1={A}&symbol2={B}` : Compare the 30-day percentage performance block of two symbols to declare a winner.

---

## 🐳 Docker Setup

You can easily run the entire backend API via Docker! I have containerized the environment so you do not need to install Python dependencies locally.

### Steps Followed to Dockerize:
1. Created a **`Dockerfile`** that pulls the lightweight `python:3.11-slim` image to keep the container small.
2. Copied over your newly generated **`requirements.txt`** and ran `pip install` inside the container image.
3. Copied all the project code into the container's `/app` working directory.
4. Exposed port `8000` from the container and set the CMD to start `uvicorn` bounded to `0.0.0.0` so it can be accessed from your local browser!
5. Created a **`.dockerignore`** file to prevent copying unnecessary local files (like the `venv` directory) into the lightweight container.

### How to Run with Docker

1. **Build the Docker Image** (from the root of the project):
   ```bash
   docker build -t jarnox-stock-api .
   ```

2. **Run the Container**:
   ```bash
   docker run -p 8000:8000 jarnox-stock-api
   ```
   *Your API is now live at `http://localhost:8000`! You can now just open `frontend/index.html` in your browser like normal, and it will cleanly connect to your containerized backend!*

---
*Developed for Jarnox.*