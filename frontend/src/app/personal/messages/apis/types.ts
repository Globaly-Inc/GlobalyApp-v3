export type Paginated<T> = {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type LastMessage = {
  id: number;
  content: string | null;
  message_type: string;
  sender_id: number;
  created_at: string;
};

export type ConversationSummary = {
  id: number;
  enquiry_id: number | null;
  title: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  my_role: string;
  my_business_id: number | null;
  last_read_message_id: number | null;
  unread_count: number;
  last_message: LastMessage | null;
};

export type Participant = {
  id: number;
  platform_user_id: number;
  role: string;
  business_id: number | null;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  business_name: string | null;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string | null;
  message_type: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  sender_name: string;
  sender_avatar: string | null;
};

export type Conversation = {
  id: number;
  enquiry_id: number | null;
  title: string | null;
  status: string;
  created_by: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  participants: Participant[];
  /** Newest-first page. `anchor_id` freezes the window so older pages never shift. */
  messages: Paginated<Message> & { meta: { anchor_id: number } };
};

export type ReadReceipt = {
  last_read_message_id: number | null;
  unread_count: number;
};
