# notification-dispatcher

Claims queued notifications with a database lease, sends them through the WhatsApp Cloud API, and completes each row as sent or retriable/dead-lettered using the database retry policy. Invoked every minute by pg_cron through a private dispatch token.
