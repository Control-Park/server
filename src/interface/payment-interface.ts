export interface IPaymentMethod {
  brand: string;
  created_at: Date;
  exp_month: number;
  exp_year: number;
  holder_name: null | string;
  id: string;
  last4: string;
  stripe_payment_method_id: string;
  user_id: string;
}
