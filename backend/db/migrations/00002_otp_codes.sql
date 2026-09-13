create table otp_codes (
  id uuid default gen_random_uuid() primary key,
  phone text not null,
  code text not null,
  expires_at timestamp not null,
  created_at timestamp default now()
);

-- Helpful index since we'll look these up by phone + code frequently
create index idx_otp_codes_phone_code on otp_codes (phone, code);
