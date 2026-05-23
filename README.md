# Indian Stock Data Using Screener

A Node.js project that automatically extracts and aggregates Indian stock market data from [Screener.in](https://www.screener.in) daily. This project uses GitHub Actions to schedule daily data scraping, maintaining an up-to-date JSON database of stock information.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Data Files](#data-files)
- [Automation](#automation)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 📚 Overview

This project automates the extraction of Indian stock market data from Screener.in, which is a popular financial data platform for Indian stocks. The data is collected daily and stored in a JSON format for easy consumption and analysis.

**Key Goals:**
- Automatically collect stock data daily without manual intervention
- Maintain a historical database of stock information
- Provide structured data (JSON format) for analysis and integration with other tools
- Track multiple Indian companies listed on BSE/NSE

## ✨ Features

- **Automated Daily Updates**: GitHub Actions workflow runs daily at 2:00 PM UTC (7:30 PM IST)
- **Batch Processing**: Scrapes data for multiple stocks sequentially with polite delays
- **Data Persistence**: Appends new data to existing records, maintaining historical information
- **Error Handling**: Gracefully skips companies that fail to load while continuing with others
- **Company Name Mapping**: Associates numeric ticker codes with company names from CSV
- **Manual Trigger**: Supports manual workflow execution through GitHub UI

## 📁 Project Structure

```
Indian-Stock-Data-Using-Screener/
├── .github/
│   └── workflows/
│       └── update.yml              # GitHub Actions workflow for daily automation
├── scrape.js                        # Main scraping script
├── package.json                     # Node.js dependencies and project metadata
├── eligible.csv                     # CSV file with company codes and names (configuration)
├── master_data.json                 # Generated JSON database with all stock data (output)
└── README.md                        # This file
```

## 🔧 Prerequisites

- **Node.js**: Version 20 or higher
- **npm**: Comes with Node.js
- **Git**: For version control and GitHub integration
- **GitHub Account**: To run automated workflows

## 💾 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kvimal24-jpg/Indian-Stock-Data-Using-Screener.git
   cd Indian-Stock-Data-Using-Screener
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

   This installs the required package:
   - `screener-scraper-pro`: Library for scraping Screener.in data

## 🚀 Usage

### Manual Execution

To run the scraper manually on your local machine:

```bash
node scrape.js
```

**What the script does:**
1. Reads the `eligible.csv` file containing company codes and names
2. Iterates through each ticker code
3. Fetches data from `https://www.screener.in/company/{ticker}/`
4. Enriches the data with company names from the CSV
5. Merges with existing data in `master_data.json`
6. Saves the updated database

**Output:**
- Console logs showing progress (`[1/50] Fetching 500325 (Company Name)...`)
- Warning messages for any tickers that fail to load
- Final confirmation when data is saved

## ⚙️ Configuration

### Managing Stock Tickers

The `eligible.csv` file is the **single source of truth** for all stock tickers and company information. To add or remove stocks:

1. **Edit `eligible.csv`** with the following format:
   - **Column 1**: Index number
   - **Column 2**: Scrip Code (numeric ticker from Screener.in)
   - **Column 3+**: Company Name

**Example:**
```csv
Index,Scrip Code,Company Name
1,500325,Reliance Industries
2,500180,HDFC Bank
3,532454,HDFC Life Insurance
4,532540,Maruti Suzuki
5,532174,SBI Card
```

The script automatically parses this file and scrapes data for all companies listed.

### Schedule Configuration

The daily schedule is defined in `.github/workflows/update.yml`:

```yaml
schedule:
  - cron: '0 14 * * *'  # Runs daily at 2:00 PM UTC (7:30 PM IST)
```

To modify the schedule, edit the cron expression. [Cron syntax reference](https://crontab.guru/)

## 📊 Data Files

### master_data.json (Output)

The primary output file containing aggregated stock data:
- **Format**: JSON object with ticker codes as keys
- **Contents**: Complete stock information from Screener.in including:
  - Financial metrics (P/E ratio, market cap, etc.)
  - Stock details (sector, industry, etc.)
  - Company information (name, headquarters, etc.)
  - Historical performance data
- **Size**: ~40+ MB (grows with each update)
- **Auto-Updated**: Yes, by the GitHub Actions workflow

**Example structure:**
```json
{
  "500325": {
    "CompanyName": "Reliance Industries",
    "financialMetrics": { ... },
    "stockDetails": { ... }
  },
  "500180": {
    "CompanyName": "HDFC Bank",
    ...
  }
}
```

### eligible.csv (Configuration)

The configuration file that controls which stocks are scraped:
- **Format**: CSV with headers (Index, Scrip Code, Company Name)
- **Purpose**: Defines all stocks to be included in daily scraping
- **Manually maintained**: Add, remove, or update entries as needed
- **Single source of truth**: The script dynamically reads all tickers from this file

## 🤖 Automation

### GitHub Actions Workflow

The `.github/workflows/update.yml` file automates daily data collection:

**Trigger Points:**
- **Scheduled**: Daily at 2:00 PM UTC (7:30 PM IST)
- **Manual**: Via "Run workflow" button on GitHub Actions tab

**Workflow Steps:**
1. Checks out the latest code
2. Sets up Node.js v20
3. Installs npm dependencies
4. Executes `scrape.js`
5. Configures git user (DataBot)
6. Stages `master_data.json` for commit
7. Commits changes with message "Daily Data Update"
8. Pushes to the repository

**Permissions**: The workflow has `contents: write` access to commit and push changes.

### Manual Trigger

To manually run the workflow:
1. Go to GitHub repository
2. Click "Actions" tab
3. Select "Update Stock Data" workflow
4. Click "Run workflow"
5. Confirm with the blue "Run workflow" button

## 🏗️ Architecture

### Data Flow

```
eligible.csv (Configuration)
     ↓
scrape.js (Node.js)
  - Parse CSV
  - Extract tickers & names
  ↓
Screener.in API
     ↓
master_data.json (Output)
     ↓
Git Commit & Push
```

### Key Script Components

**scrape.js** handles:
1. **CSV Parsing**: Reads `eligible.csv` and extracts ticker codes and company names
2. **Data Fetching**: Uses `screener-scraper-pro` to query Screener.in
3. **Data Enrichment**: Adds company names to scraped data
4. **Data Merging**: Appends new data to existing `master_data.json`
5. **Error Handling**: Catches and logs errors for individual stocks
6. **Rate Limiting**: 2-second delay between requests (polite scraping)

## 🐛 Troubleshooting

### Common Issues

**Issue**: `Error: Could not find 'eligible.csv'`
- **Solution**: Ensure `eligible.csv` exists in the repository root with proper formatting

**Issue**: Script hangs or times out
- **Solution**: 
  - Check internet connection
  - Verify Screener.in is accessible
  - Reduce the number of tickers in eligible.csv to test

**Issue**: GitHub Actions workflow fails silently
- **Solution**: 
  1. Check the workflow logs in GitHub Actions tab
  2. Verify npm dependencies are correct
  3. Confirm `screener-scraper-pro` package is working

**Issue**: Git commit fails in workflow
- **Solution**: The workflow includes `|| exit 0` to ignore commit failures if there are no changes

**Issue**: Some tickers fail to load while others succeed
- **Solution**: This is expected behavior. The script logs warnings for failed tickers and continues with others. Check workflow logs to see which tickers failed.

### Checking Workflow Logs

1. Navigate to "Actions" tab on GitHub
2. Click on the latest "Update Stock Data" run
3. Click on the "update" job to view detailed logs
4. Check for error messages in the "Run scrape.js" step

## 📝 Contributing

Contributions are welcome! To contribute:

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes**: Add stocks, fix bugs, improve documentation
4. **Test locally**: Run `node scrape.js` to verify
5. **Commit**: `git commit -m "Description of changes"`
6. **Push**: `git push origin feature/your-feature`
7. **Open a Pull Request**

### Areas for Improvement

- Add error retry logic with exponential backoff
- Store historical snapshots instead of just latest data
- Add data validation and quality checks
- Support filtering by sector/industry
- Add data export formats (CSV, Excel)
- Implement incremental updates instead of full rewrites
- Add progress tracking and notifications

## 📄 License

This project is currently unlicensed. Consider adding a LICENSE file (e.g., MIT, Apache 2.0).

## 🔗 Resources

- [Screener.in](https://www.screener.in) - Indian stock market data platform
- [screener-scraper-pro](https://www.npmjs.com/package/screener-scraper-pro) - NPM package
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Node.js Documentation](https://nodejs.org/docs/)

## 📧 Contact

For questions or support, please open an issue on the GitHub repository.

---

**Last Updated**: May 2026
**Status**: Active
**Maintenance**: Daily automated updates with GitHub Actions
