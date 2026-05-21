import fs from 'fs/promises';
import { ScreenerScraperPro } from 'screener-scraper-pro';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    // Read both the tickers and the name mapping
    const tickers = JSON.parse(await fs.readFile('tickers.json', 'utf-8'));
    const nameMap = JSON.parse(await fs.readFile('mapping.json', 'utf-8'));
    
    let masterData = {};
    
    try {
        const existing = await fs.readFile('master_data.json', 'utf-8');
        masterData = JSON.parse(existing);
    } catch(e) { 
        console.log("No existing data found, starting fresh.");
    }

    for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        try {
            console.log(`Fetching ${ticker}...`);
            const data = await ScreenerScraperPro(`https://www.screener.in/company/${ticker}/`);
            
            // INJECT THE COMPANY NAME HERE
            data["CompanyName"] = nameMap[ticker] || "Name Not Found";
            
            masterData[ticker] = data;
        } catch (e) {
            console.log(`Skipped ${ticker}: ${e.message}`);
        }
        await delay(2000); 
    }
    
    await fs.writeFile('master_data.json', JSON.stringify(masterData, null, 2));
    console.log("Data saved successfully.");
}
run();
