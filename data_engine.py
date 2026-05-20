import numpy as np
import yfinance as yf
import pandas as pd
from sklearn.linear_model import LinearRegression
import datetime

def fetch_stock_data(symbol: str, period: str = "2y") -> pd.DataFrame:
    
    print(f"Fetching data for {symbol}...")
    try:
        # Initialize the Ticker object
        stock = yf.Ticker(symbol)
        
        # Fetch historical data
        df = stock.history(period=period)
        
        # Check if the dataframe is empty (e.g., if the symbol is invalid)
        if df.empty:
            print(f"Warning: No data found for symbol '{symbol}'. It may be delisted or invalid.")
            return pd.DataFrame()
            
        # Reset index to make 'Date' a regular column (makes API JSON conversion easier)
        df = df.reset_index()
        
        # yfinance dates are timezone-aware. We convert them to timezone-naive 
        # to prevent JSON serialization errors in FastAPI later.
        if 'Date' in df.columns:
            df['Date'] = pd.to_datetime(df['Date']).dt.tz_localize(None)
            
        print(f"Successfully fetched {len(df)} rows for {symbol}.")
        return df
        
    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return pd.DataFrame()


import numpy as np # Add this to your imports at the top!

def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cleans the dataframe by handling missing values and rounding prices.
    """
    if df.empty:
        return df
        
    # Forward fill any missing data points (common in finance for halted trading days)
    df = df.ffill()
    
    # Drop any remaining NaNs (usually at the very beginning of the dataset)
    df = df.dropna()
    
    # Round financial columns to 2 decimal places for a clean API response
    cols_to_round = ['Open', 'High', 'Low', 'Close']
    df[cols_to_round] = df[cols_to_round].round(2)
    
    return df

def calculate_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculates the assignment's required metrics and the custom Volatility Score.
    """
    if df.empty:
        return df
        
    df = df.copy()

    # 1. Required: Daily Return = (CLOSE - OPEN) / OPEN
    df['Daily_Return'] = (df['Close'] - df['Open']) / df['Open']

    # 2. Required: 7-day Moving Average of the Closing price
    df['7_Day_MA'] = df['Close'].rolling(window=7).mean().round(2)

    # 3. Required: 52-week High/Low (Using 252 trading days in a year)
    # min_periods=1 ensures we get data even if we don't have a full 252 days yet
    df['52_Week_High'] = df['High'].rolling(window=252, min_periods=1).max().round(2)
    df['52_Week_Low'] = df['Low'].rolling(window=252, min_periods=1).min().round(2)

    # 🔥 THE STANDOUT MOVE: 30-Day Rolling Annualized Volatility
    # Volatility measures risk. 
    df['30_Day_Volatility'] = (df['Daily_Return'].rolling(window=30).std() * np.sqrt(252)).round(4)

    return df

def predict_prices(df: pd.DataFrame, future_days: int = 3) -> list:
    """
    Uses Simple Linear Regression to predict future closing prices.
    Trains on the provided dataframe (e.g., last 30 days).
    """
    if df.empty or len(df) < 10: # Need some minimum data to run a regression
        return []

    # 1. Prepare the Data
    # We create a simple time index (0, 1, 2, 3...) to represent days
    df = df.copy()
    df['Time_Index'] = np.arange(len(df))
    
    # X is our feature (Time_Index), y is our target (Close price)
    # sklearn requires X to be a 2D array, so we reshape it
    X = df['Time_Index'].values.reshape(-1, 1)
    y = df['Close'].values

    # 2. Train the Model
    model = LinearRegression()
    model.fit(X, y)

    # 3. Predict the Future
    # Create time indices for the future days
    last_index = df['Time_Index'].max()
    future_indices = np.array([last_index + i for i in range(1, future_days + 1)]).reshape(-1, 1)
    
    # Get the predicted prices
    predictions = model.predict(future_indices)
    
    # 4. Format the Output
    # We want to return dates and prices so the frontend can plot them
    last_date = pd.to_datetime(df['Date'].iloc[-1])
    predicted_data = []
    
    for i, price in enumerate(predictions):
        # Add days to the last date (skipping weekends for realistic trading days is a bonus, 
        # but simple timedelta is fine for this scope)
        next_date = last_date + datetime.timedelta(days=i+1)
        predicted_data.append({
            "Date": next_date.strftime("%Y-%m-%d"),
            "Predicted_Close": round(float(price), 2)
        })

    return predicted_data

def search_stock_details(symbol: str) -> dict:
    """
    Searches for a specific stock and returns its latest details and metrics.
    """
    df = fetch_stock_data(symbol, period="1y")
    if df.empty:
        return {"error": f"No data found for symbol '{symbol}'"}
        
    df = clean_data(df)
    df = calculate_metrics(df)
    
    # Get the most recent day's data
    latest_data = df.iloc[-1]
    
    details = {
        "symbol": symbol.upper(),
        "date": str(latest_data.get('Date', '')),
        "close_price": float(latest_data.get('Close', 0.0)),
        "open_price": float(latest_data.get('Open', 0.0)),
        "high": float(latest_data.get('High', 0.0)),
        "low": float(latest_data.get('Low', 0.0)),
        "daily_return": float(latest_data.get('Daily_Return', 0.0)) if pd.notna(latest_data.get('Daily_Return')) else None,
        "7_day_ma": float(latest_data.get('7_Day_MA', 0.0)) if pd.notna(latest_data.get('7_Day_MA')) else None,
        "52_week_high": float(latest_data.get('52_Week_High', 0.0)) if pd.notna(latest_data.get('52_Week_High')) else None,
        "52_week_low": float(latest_data.get('52_Week_Low', 0.0)) if pd.notna(latest_data.get('52_Week_Low')) else None,
        "30_day_volatility": float(latest_data.get('30_Day_Volatility', 0.0)) if pd.notna(latest_data.get('30_Day_Volatility')) else None,
    }
    
    return details

# --- Testing the function ---
# This block only runs if you execute this script directly, not when imported by FastAPI
if __name__ == "__main__":
    test_symbol = "RELIANCE.NS" 
    print(f"Testing pipeline with {test_symbol}...")
    
    # Step 1: Fetch
    raw_df = fetch_stock_data(test_symbol, period="2y")
    
    # Step 2: Clean
    cleaned_df = clean_data(raw_df)
    
    # Step 3: Calculate Metrics
    final_df = calculate_metrics(cleaned_df)
    
    if not final_df.empty:
        # Display the last 5 days to see all our new calculated columns!
        print("\n--- Final Processed Data (Last 5 Days) ---")
        print(final_df[['Date', 'Close', 'Daily_Return', '7_Day_MA', '52_Week_High', '30_Day_Volatility']].tail())