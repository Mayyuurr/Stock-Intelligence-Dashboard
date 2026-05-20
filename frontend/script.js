// Use localhost for testing the new local features!
const API_BASE = "http://localhost:8000";
// const API_BASE = "https://stock-intelligence-dashboard-lgdh.onrender.com";
const WS_BASE = API_BASE.replace(/^http/, 'ws');
let currentChart = null;
let currentWebSocket = null;

// Initialize dashboard on load
document.addEventListener("DOMContentLoaded", () => {
    loadCompanies();

    // Add enter key support for search
    document.getElementById("searchInput").addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            searchStock();
        }
    });
});

/**
 * 1. Fetch and display companies in the sidebar
 */
async function loadCompanies() {
    try {
        const response = await fetch(`${API_BASE}/companies`);
        const companies = await response.json();

        const listEl = document.getElementById("company-list");
        listEl.innerHTML = "";

        companies.forEach(company => {
            const li = document.createElement("li");
            li.innerHTML = `
                <button onclick="searchStock('${company.symbol}')" class="company-btn">
                    <span class="company-symbol">${company.symbol}</span>
                    <span class="company-name">${company.name}</span>
                </button>
            `;
            listEl.appendChild(li);
        });
    } catch (error) {
        console.error("Error fetching companies:", error);
        document.getElementById("company-list").innerHTML = `<li class="loading">Failed to load companies</li>`;
    }
}

/**
 * 2. Search specific stock using the new API endpoint
 */
async function searchStock(inputSymbol = null) {
    let symbol;
    const input = document.getElementById("searchInput");

    if (inputSymbol) {
        symbol = inputSymbol;
    } else {
        symbol = input.value.trim().toUpperCase();
    }

    if (!symbol) return;

    try {
        // Call the new search API
        const searchRes = await fetch(`${API_BASE}/search/${symbol}`);
        if (!searchRes.ok) {
            alert(`Could not find data for ${symbol}. It may be invalid or delisted.`);
            return;
        }
        const details = await searchRes.json();

        // Display the new metrics
        const detailsCard = document.getElementById("search-details-card");
        const detailsContent = document.getElementById("search-details-content");
        document.getElementById("search-details-title").innerText = `${details.symbol} Latest Details (${details.date})`;

        const dailyReturnColor = (details.daily_return && details.daily_return >= 0) ? 'text-green' : 'text-red';
        const dailyReturnText = details.daily_return !== null ? (details.daily_return * 100).toFixed(2) + '%' : 'N/A';

        detailsContent.innerHTML = `
            <div class="detail-item">
                <span class="label">Close Price</span>
                <span class="value">₹${details.close_price}</span>
            </div>
            <div class="detail-item">
                <span class="label">Open Price</span>
                <span class="value">₹${details.open_price}</span>
            </div>
            <div class="detail-item">
                <span class="label">Daily Return</span>
                <span class="value ${dailyReturnColor}">${dailyReturnText}</span>
            </div>
            <div class="detail-item">
                <span class="label">7-Day MA</span>
                <span class="value">₹${details['7_day_ma'] !== null ? details['7_day_ma'] : 'N/A'}</span>
            </div>
            <div class="detail-item">
                <span class="label">30D Volatility</span>
                <span class="value">${details['30_day_volatility'] !== null ? details['30_day_volatility'] : 'N/A'}</span>
            </div>
        `;

        detailsCard.classList.add("active");

        // Also load the chart natively so 30-day views populate
        loadStockData(symbol);

        // Start the Live WebSocket Feed
        startLiveFeed(symbol);

        input.value = ""; // clear input

    } catch (error) {
        console.error("Search error:", error);
        alert("Error searching stock details.");
    }
}

/**
 * 3. Fetch historical AND prediction data for chart and summary cards
 */
async function loadStockData(symbol) {
    document.getElementById("chart-title").innerText = `${symbol} - 30 Day Trend & ML Prediction`;

    // Add loading state visually
    document.getElementById("stat-high").innerHTML = `<span class="loading">...</span>`;
    document.getElementById("stat-low").innerHTML = `<span class="loading">...</span>`;
    document.getElementById("stat-avg").innerHTML = `<span class="loading">...</span>`;

    try {
        // Fetch Summary Stats
        const summaryRes = await fetch(`${API_BASE}/summary/${symbol}`);
        const summary = await summaryRes.json();
        document.getElementById("stat-high").innerText = `₹${summary['52_week_high']}`;
        document.getElementById("stat-low").innerText = `₹${summary['52_week_low']}`;
        document.getElementById("stat-avg").innerText = `₹${summary['average_close']}`;

        // Fetch Historical Data
        const dataRes = await fetch(`${API_BASE}/data/${symbol}`);
        const dataResponse = await dataRes.json();
        const stockData = dataResponse.data;

        // Fetch Prediction Data (The new ML Endpoint!)
        const predictRes = await fetch(`${API_BASE}/predict/${symbol}`);
        const predictResponse = await predictRes.json();
        const predictions = predictResponse.predictions;

        // --- DATA PREPARATION FOR CHART.JS ---

        // 1. Combine all dates (Historical + Future)
        const histLabels = stockData.map(item => item.Date.split(" ")[0]);
        const predLabels = predictions.map(item => item.Date);
        const allLabels = [...histLabels, ...predLabels];

        // 2. Prepare Historical Prices
        const histPrices = stockData.map(item => item.Close);
        const lastHistPrice = histPrices[histPrices.length - 1];
        const paddedHistPrices = [...histPrices, ...Array(predLabels.length).fill(null)];

        // 3. Prepare Predicted Prices (connect the lines)
        const predPrices = predictions.map(item => item.Predicted_Close);
        const paddedPredPrices = [...Array(histPrices.length - 1).fill(null), lastHistPrice, ...predPrices];

        // Render the chart with both datasets
        renderChart(allLabels, paddedHistPrices, paddedPredPrices, symbol);

    } catch (error) {
        console.error("Error fetching stock data:", error);
    }
}

/**
 * 4. Render Chart.js with Two Datasets using sleek glassmorphism options
 */
function renderChart(labels, histData, predData, symbol) {
    const ctx = document.getElementById('stockChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    // Chart.js global defaults for our dark aesthetic
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `${symbol} Historical Close`,
                    data: histData,
                    borderColor: '#818cf8', // Indigo
                    backgroundColor: 'rgba(129, 140, 248, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4, // ultra smooth
                    pointRadius: 0, // hide points unless hover
                    pointHoverRadius: 6
                },
                {
                    label: `3-Day AI Prediction`,
                    data: predData,
                    borderColor: '#f472b6', // Pinkish
                    borderDash: [6, 4],
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 14, family: 'Inter' },
                    bodyFont: { size: 13, family: 'Inter' },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true
                },
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { size: 13, family: 'Inter', weight: 600 }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    }
                }
            }
        }
    });
}

/**
 * 5. Compare Two Stocks
 */
async function compareStocks() {
    const sym1 = document.getElementById("compareSym1").value.trim().toUpperCase();
    const sym2 = document.getElementById("compareSym2").value.trim().toUpperCase();

    if (!sym1 || !sym2) {
        alert("Please enter both symbols to compare.");
        return;
    }

    const resultsContainer = document.getElementById("compare-results");
    resultsContainer.classList.remove("active");
    resultsContainer.innerHTML = `<div class="loading">Comparing...</div>`;
    resultsContainer.style.display = "grid"; // Make it visible briefly for loading
    resultsContainer.classList.add("active");

    try {
        const response = await fetch(`${API_BASE}/compare?symbol1=${sym1}&symbol2=${sym2}`);
        if (!response.ok) {
            alert("Could not fetch comparison data. Check if symbols are valid.");
            resultsContainer.classList.remove("active");
            resultsContainer.style.display = "none";
            return;
        }

        const data = await response.json();

        let html = "";

        // Helper to generate HTML for a single stock card
        const generateCard = (symbol, stockData) => {
            const isWinner = data.winner === symbol;
            const returnClass = stockData.total_return_percent >= 0 ? 'text-green' : 'text-red';
            return `
                <div class="compare-card-stock ${isWinner ? 'winner' : ''}">
                    ${isWinner ? '<div class="winner-badge">Winner</div>' : ''}
                    <h4 style="font-size: 1.2rem; margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">${symbol}</h4>
                    <div class="compare-stat">
                        <span class="label" style="color: var(--text-muted)">Start Price (30d ago)</span>
                        <span class="value">₹${stockData.start_price}</span>
                    </div>
                    <div class="compare-stat">
                        <span class="label" style="color: var(--text-muted)">End Price (Latest)</span>
                        <span class="value">₹${stockData.end_price}</span>
                    </div>
                    <div class="compare-stat" style="margin-top: 0.5rem; border: none;">
                        <span class="label" style="font-weight: bold; color: var(--text-muted)">30-Day Return</span>
                        <span class="value ${returnClass}" style="font-weight: bold; font-size: 1.1rem;">${stockData.total_return_percent}%</span>
                    </div>
                </div>
            `;
        };

        html += generateCard(sym1, data[sym1]);
        html += generateCard(sym2, data[sym2]);

        resultsContainer.innerHTML = html;

    } catch (error) {
        console.error("Error comparing stocks:", error);
        resultsContainer.innerHTML = `<div class="text-red">Error loading comparison.</div>`;
    }
}

/**
 * 6. Live WebSocket Feed
 */
function startLiveFeed(symbol) {
    const liveFeedCard = document.getElementById("live-feed-card");
    const livePriceEl = document.getElementById("ws-live-price");
    const liveChangeEl = document.getElementById("ws-live-change");
    const liveTimeEl = document.getElementById("ws-live-time");

    // Reset UI
    livePriceEl.innerText = "--";
    livePriceEl.className = "stat-value";
    liveChangeEl.innerText = "--";
    liveChangeEl.className = "stat-value";
    liveTimeEl.innerText = "--";
    liveFeedCard.style.display = "block";

    // Close existing connection if any
    if (currentWebSocket) {
        currentWebSocket.close();
    }

    const wsUrl = `${WS_BASE}/ws/live/${symbol}`;
    currentWebSocket = new WebSocket(wsUrl);

    currentWebSocket.onopen = () => {
        console.log(`WebSocket connected for ${symbol}`);
    };

    currentWebSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
            livePriceEl.innerText = "Error";
            liveChangeEl.innerText = data.error;
            return;
        }

        livePriceEl.innerText = `₹${data.live_price}`;

        const changeVal = data.change_from_close;
        const changeSign = changeVal >= 0 ? "+" : "";
        liveChangeEl.innerText = `${changeSign}₹${changeVal.toFixed(2)}`;
        liveChangeEl.className = `stat-value ${changeVal >= 0 ? 'text-green' : 'text-red'}`;

        const now = new Date();
        liveTimeEl.innerText = now.toLocaleTimeString();
    };

    currentWebSocket.onerror = (error) => {
        console.error("WebSocket Error:", error);
        livePriceEl.innerText = "Connection Failed";
    };

    currentWebSocket.onclose = () => {
        console.log(`WebSocket disconnected for ${symbol}`);
    };
}
