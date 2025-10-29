// Manual script to advance current week to 9
// Run this in your browser console while on your app

async function advanceToWeek9() {
  try {
    console.log('🔄 Manually advancing current week to 9...');

    // This assumes you have access to the supabase client
    // If you're logged into your admin panel, this should work
    if (typeof supabase === 'undefined') {
      console.error('❌ Supabase client not found. Make sure you\'re on your app page.');
      return;
    }

    // Update league_settings to current week 9
    const { data, error } = await supabase
      .from('league_settings')
      .update({ current_week: 9 })
      .eq('id', 1); // Assuming first record

    if (error) {
      console.error('❌ Error updating current week:', error);
      return;
    }

    console.log('✅ Successfully updated current week to 9');
    console.log('🔄 Refreshing page to see changes...');

    // Refresh the page to see the changes
    window.location.reload();

  } catch (error) {
    console.error('❌ Failed to advance week:', error);
  }
}

// Run the function
advanceToWeek9();