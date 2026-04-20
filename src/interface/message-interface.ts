export interface IConversation {
  created_at: string;
  guest?: { first_name: string; last_name: string };
  guest_id: string;
  host?: { first_name: string; last_name: string };
  host_id: string;
  id: string;
  last_message?: { body: string; created_at: string };
  listing?: { title: string };
  listing_id: string;
}

export interface IMessage {
  body: string;
  conversation_id: string;
  created_at: string;
  id: string;
  sender_id: string;
}
