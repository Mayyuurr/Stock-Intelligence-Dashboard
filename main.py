import asyncio
import random
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import data_engine # Importing your awesome Day 1 code!

app = FastAPI(
    title="Stock Data Intelligence API",
    description="A financial data REST API built for the Jarnox Internship Assignment.",
    version="1.0.0"
)

# Enable CORS so your future React frontend can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A mock database of available companies
AVAILABLE_COMPANIES = {
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "Tata Consultancy Services",
    "INFY.NS": "Infosys",
    "HDFCBANK.NS": "HDFC Bank",
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft",
    "GOOGL": "Alphabet (Google)"
}

@app.get("/")
def read_root():
    return {"message": "Welcome to the Stock Data Intelligence API! Visit /docs for Swagger UI."}

@app.get("/companies")
def get_companies():
    """Returns a list of all available companies."""
    # Formatting as a list of dictionaries for easier frontend use later
    return [{"symbol": symbol, "name": name} for symbol, name in AVAILABLE_COMPANIES.items()]

@app.get("/data/{symbol}")
def get_stock_data(symbol: str):
    """Returns the last 30 days of stock data and metrics for a given symbol."""
    symbol = symbol.upper()
    
    # 1. Fetch Data
    df = data_engine.fetch_stock_data(symbol, period="1y") # 1y is enough for 30 days + 52wk metrics
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Data not found for symbol: {symbol}")
        
    # 2. Clean and Calculate
    df = data_engine.clean_data(df)
    df = data_engine.calculate_metrics(df)
    
    # 3. Filter to last 30 days
    last_30_days = df.tail(30).copy()
    
    # Convert dates to string so they format perfectly in JSON
    if 'Date' in last_30_days.columns:
        last_30_days['Date'] = last_30_days['Date'].astype(str)
        
    # Convert Pandas DataFrame to a list of dictionaries (JSON friendly)
    result = last_30_days.to_dict(orient="records")
    
    return {"symbol": symbol, "data": result}

@app.get("/summary/{symbol}")
def get_stock_summary(symbol: str):
    """Returns 52-week high, low, and average close for a given symbol."""
    symbol = symbol.upper()
    
    # Fetch 1 year of data to calculate the 52-week stats
    df = data_engine.fetch_stock_data(symbol, period="1y")
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"Data not found for symbol: {symbol}")
    
    df = data_engine.clean_data(df)
    
    # Calculate the summary stats directly from the 1-year dataset
    fifty_two_week_high = float(df['High'].max())
    fifty_two_week_low = float(df['Low'].min())
    average_close = float(df['Close'].mean())
    
    return {
        "symbol": symbol,
        "52_week_high": round(fifty_two_week_high, 2),
        "52_week_low": round(fifty_two_week_low, 2),
        "average_close": round(average_close, 2)
    }

@app.get("/search/{symbol}")
def search_stock(symbol: str):
    """Searches for a specific stock and returns its latest details."""
    details = data_engine.search_stock_details(symbol)
    if "error" in details:
        raise HTTPException(status_code=404, detail=details["error"])
    return details

@app.get("/compare")
def compare_stocks(symbol1: str, symbol2: str):
    """(Bonus) Compares the 30-day performance of two stocks."""
    sym1 = symbol1.upper()
    sym2 = symbol2.upper()
    
    # Fetch the last 1 month of data for both stocks
    df1 = data_engine.fetch_stock_data(sym1, period="1mo")
    df2 = data_engine.fetch_stock_data(sym2, period="1mo")
    
    if df1.empty or df2.empty:
        raise HTTPException(status_code=404, detail="One or both symbols not found.")
        
    df1 = data_engine.clean_data(df1)
    df2 = data_engine.clean_data(df2)
    
    # Calculate the total percentage return over the last 30 days
    # Formula: ((Last Close - First Close) / First Close) * 100
    return1 = ((df1['Close'].iloc[-1] - df1['Close'].iloc[0]) / df1['Close'].iloc[0]) * 100
    return2 = ((df2['Close'].iloc[-1] - df2['Close'].iloc[0]) / df2['Close'].iloc[0]) * 100
    
    # Determine the winner
    if return1 > return2:
        winner = sym1
    elif return2 > return1:
        winner = sym2
    else:
        winner = "Tie"
        
    return {
        "comparison_period": "30 Days",
        sym1: {
            "start_price": round(float(df1['Close'].iloc[0]), 2),
            "end_price": round(float(df1['Close'].iloc[-1]), 2),
            "total_return_percent": round(float(return1), 2)
        },
        sym2: {
            "start_price": round(float(df2['Close'].iloc[0]), 2),
            "end_price": round(float(df2['Close'].iloc[-1]), 2),
            "total_return_percent": round(float(return2), 2)
        },
        "winner": winner
    }

@app.get("/predict/{symbol}")
def get_price_prediction(symbol: str):
    """(Bonus) Predicts the closing price for the next 3 days using Linear Regression."""
    symbol = symbol.upper()
    
    # Fetch recent data (e.g., last 2 months to get a solid 30-day trend)
    df = data_engine.fetch_stock_data(symbol, period="3mo")
    
    if df.empty:
        raise HTTPException(status_code=404, detail="Data not found for prediction.")
        
    df = data_engine.clean_data(df)
    
    # We train our model on the last 30 days to capture the most recent trend
    recent_trend_df = df.tail(30).copy()
    
    # Generate predictions using our new ML function
    predictions = data_engine.predict_prices(recent_trend_df, future_days=3)
    
    return {
        "symbol": symbol,
        "model": "Simple Linear Regression",
        "training_window": "30 Days",
        "predictions": predictions
    }

@app.websocket("/ws/live/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str):
    await websocket.accept()
    symbol = symbol.upper()
    
    # Get the base price to simulate from
    details = data_engine.search_stock_details(symbol)
    if "error" in details or details.get("close_price") is None:
        await websocket.send_json({"error": f"Symbol {symbol} not found"})
        await websocket.close()
        return

    base_price = details["close_price"]
    current_price = base_price

    try:
        while True:
            # Simulate a small random tick movement (-0.2% to +0.2%)
            change_percent = random.uniform(-0.002, 0.002)
            current_price = current_price * (1 + change_percent)
            
            payload = {
                "symbol": symbol,
                "live_price": round(current_price, 2),
                "change_from_close": round(current_price - base_price, 2),
                "timestamp": asyncio.get_event_loop().time()
            }
            
            await websocket.send_json(payload)
            await asyncio.sleep(2) # Send update every 2 seconds
            
    except WebSocketDisconnect:
        print(f"Client disconnected from WebSocket for {symbol}")