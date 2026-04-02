const API_BASE = "https://stock-intelligence-dashboard-lgdh.onrender.com" | "http://127.0.0.1:8000";
let currentChart = null;

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
