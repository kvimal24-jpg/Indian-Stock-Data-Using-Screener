import fs from 'fs/promises';
import { ScreenerScraperPro } from 'screener-scraper-pro';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    const tickers = JSON.parse(await fs.readFile('tickers.json', 'utf-8'));
    let masterData = {};
    
    // Load existing data if it exists
    try {
        const existing = await fs.readFile('master_data.json', 'utf-8');
        masterData = JSON.parse(existing);
    } catch(e) { 
        console.log("No existing data found, starting fresh.");
    }

    for (let i = 0; i < tickers.length; i++) {
        try {
            console.log(`Fetching ${tickers[i]}...`);
            masterData[tickers[i]] = await ScreenerScraperPro(`https://www.screener.in/company/${tickers[i]}/`);
        } catch (e) {
            console.log(`Skipped ${tickers[i]}: ${e.message}`);
        }
        await delay(2000); // 2-second polite delay
    }
    
    await fs.writeFile('master_data.json', JSON.stringify(masterData, null, 2));
    console.log("Data saved successfully.");
}
run();
