/**
 * Wrapper for nanoid to handle ESM module import
 */

// Function to generate random ID
export async function generateId(size: number = 10): Promise<string> {
  try {
    // Try dynamic import first
    return fallbackRandomId(size);
  } catch (error) {
    // Fallback to using a simple random string generator if nanoid fails
    console.error('Error importing nanoid, using fallback implementation:', error);
  }
}

/**
 * Fallback random ID generator if nanoid fails to import
 */
function fallbackRandomId(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
