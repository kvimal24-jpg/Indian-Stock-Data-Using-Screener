import fs from 'fs/promises';
import { ScreenerScraperPro } from 'screener-scraper-pro';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    console.log("Step 1: Reading CSV File...");
    let csvData;
    try {
        csvData = await fs.readFile('eligible.csv', 'utf-8');
    } catch(e) {
        console.error("❌ Error: Could not find 'eligible.csv'. Did you upload it?");
        process.exit(1);
    }
    
    const lines = csvData.split('\n');
    const tickers = [];
    const nameMap = {};
    
    // Parse the CSV automatically
    for (let i = 1; i < lines.length; i++) { // Skip the header row
        const line = lines[i].trim();
        if (!line) continue;
        
        const parts = line.split(',');
        if (parts.length >= 3) {
            // Get the 2nd column (Scrip Code) and remove the ".0"
            const code = parts[1].replace('.0', '').trim();
            
            // Get the 3rd column (Name) and remove any stray quotes
            const name = parts.slice(2).join(',').replace(/(^"|"$)/g, '').trim();
            
            if (code && !isNaN(code)) {
                tickers.push(code);
                nameMap[code] = name;
            }
        }
    }

    console.log(`✅ Loaded ${tickers.length} companies from CSV.`);

    let masterData = {};
    try {
        const existing = await fs.readFile('master_data.json', 'utf-8');
        masterData = JSON.parse(existing);
    } catch(e) { 
        console.log("No existing data found, starting fresh.");
    }

    console.log("Step 2: Starting Data Extraction...");
    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        try {
            console.log(`[${i+1}/${tickers.length}] Fetching ${ticker} (${nameMap[ticker]})...`);
            const data = await ScreenerScraperPro(`https://www.screener.in/company/${ticker}/`);
            
            // INJECT THE COMPANY NAME HERE
            data["CompanyName"] = nameMap[ticker];
            
            masterData[ticker] = data;
        } catch (e) {
            console.log(`⚠️ Skipped ${ticker}: ${e.message}`);
        }
        await delay(2000); // 2-second polite delay
    }
    
    await fs.writeFile('master_data.json', JSON.stringify(masterData, null, 2));
    console.log("✅ ETL Complete! Data saved successfully.");
}

run();
