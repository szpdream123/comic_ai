UPDATE users
SET phone_e164 = regexp_replace(phone_e164, '^\+86', ''),
    updated_at = now()
WHERE phone_e164 LIKE '+86%';

UPDATE login_challenges
SET phone_e164 = regexp_replace(phone_e164, '^\+86', '')
WHERE phone_e164 LIKE '+86%';

UPDATE sms_send_records
SET phone_e164 = regexp_replace(phone_e164, '^\+86', '')
WHERE phone_e164 LIKE '+86%';

UPDATE project_upload_records
SET actor_phone_e164 = regexp_replace(actor_phone_e164, '^\+86', '')
WHERE actor_phone_e164 LIKE '+86%';
