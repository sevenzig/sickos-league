// Script to upload Week 8 CSV data to the database
import { readFileSync } from 'fs';
import { importWeeklyCSV } from './src/services/csvImporter.js';

async function uploadWeek8Data() {
  try {
    console.log('🔄 Starting Week 8 data upload...');
    
    // Read the CSV file
    const csvData = readFileSync('weekly-scoring-data/BQBL 2025 WEEK 08.xlsx - fdata_week08.csv', 'utf8');
    
    console.log('📄 CSV file loaded successfully');
    console.log(`📊 CSV contains ${csvData.split('\n').length - 1} data rows`);
    
    // Import the data
    const result = await importWeeklyCSV(csvData, 8, 2025);
    
    if (result.success) {
      console.log('✅ Week 8 data uploaded successfully!');
      console.log(`📈 Records imported: ${result.recordsImported}`);
      if (result.newCurrentWeek) {
        console.log(`🔄 Current week advanced to: ${result.newCurrentWeek}`);
      }
    } else {
      console.error('❌ Upload failed:');
      result.errors.forEach(error => console.error(`  - ${error}`));
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

uploadWeek8Data();
