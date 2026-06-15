import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, feeId } = await req.json();
    
    const key_secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Payment is successful
      // Update DB
      const supabase = await createServerSupabaseClient();
      
      const { error } = await supabase
        .from('fee_payments')
        .update({ 
          status: 'completed', 
          transaction_id: razorpay_payment_id,
          payment_date: new Date().toISOString()
        })
        .eq('id', feeId);
        
      if (error) throw error;

      return NextResponse.json({ success: true, message: 'Payment verified successfully' });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Verification failed', details: error.message },
      { status: 500 }
    );
  }
}
