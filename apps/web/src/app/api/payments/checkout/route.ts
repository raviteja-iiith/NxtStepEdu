import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { amount, feeId } = await req.json();
    
    // In a real app, keys should be in env
    // RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
    const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummykey';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

    const razorpay = new Razorpay({
      key_id,
      key_secret,
    });

    // Amount is in currency subunits (paise for INR)
    const options = {
      amount: Math.round(amount * 100), 
      currency: 'INR',
      receipt: `receipt_${feeId}_${Date.now()}`,
      payment_capture: 1, // Auto capture
    };

    const order = await razorpay.orders.create(options);
    
    // Optional: Log intent to DB
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Could log payment intent here
    }

    return NextResponse.json({ order });
  } catch (error: any) {
    console.error('Razorpay Error:', error);
    return NextResponse.json(
      { error: 'Failed to create order', details: error.message },
      { status: 500 }
    );
  }
}
