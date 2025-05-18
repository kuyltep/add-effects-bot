import axios from 'axios';

// Interface for Product data received from the microservice
export interface MSProduct {
  id: string; // Product ID
  name: string;
  description?: string;
  price: number;
  generations: number;
  currency?: string;
  botName: string;
  paymentId: string;    // ID of the payment record on the microservice
  paymentLink: string;  // Direct payment link for this product
}

const getPaymentServiceUrl = () => {
  const url = process.env.PAYMENT_SERVICE_API_URL;
  if (!url) {
    throw new Error('Payment service URL is not configured.');
  }
  return url;
};

const getPaymentServiceApiKey = () => {
  const apiKey = process.env.PAYMENT_SERVICE_API_KEY;
  if (!apiKey) {
    throw new Error('Payment service API key is not configured.');
  }
  return apiKey;
};

export async function getProductsFromMS(botName: string): Promise<MSProduct[]> {
  const baseUrl = getPaymentServiceUrl();
  const apiKey = getPaymentServiceApiKey();
  const productsUrl = `${baseUrl}/api/products/${botName}`;

  try {
    const response = await axios.get<MSProduct[]>(productsUrl, {
      headers: { 'x-api-key': apiKey },
    });
    return response.data;
  } catch (error) {

    throw error; // Re-throw to be handled by the caller
  }
}


export async function updatePaymentOnMS(paymentId: string, updateData: {userId?: string, username?: string, amount?: number, status?: string, generationsAdded?: number, productId?: string}): Promise<any> {
  const baseUrl = getPaymentServiceUrl();
  const apiKey = getPaymentServiceApiKey();
  const updateUrl = `${baseUrl}/api/payments/${paymentId}`;

  try {
    const response = await axios.patch(updateUrl, updateData, {
      headers: { 
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
    });
    return response.data;
  } catch (error) {
  
    throw error; // Re-throw to be handled by the caller
  }
} 