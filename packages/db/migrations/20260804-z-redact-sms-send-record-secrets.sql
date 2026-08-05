UPDATE sms_send_records
SET verification_code = NULL,
    sms_content = NULL
WHERE verification_code IS NOT NULL
   OR sms_content IS NOT NULL;
