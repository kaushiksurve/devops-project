\getenv taskflow_app_password TASKFLOW_APP_PASSWORD
CREATE ROLE taskflow_app LOGIN PASSWORD :'taskflow_app_password';

GRANT CONNECT, CREATE ON DATABASE taskflow TO taskflow_app;
GRANT USAGE, CREATE ON SCHEMA public TO taskflow_app;

CREATE DATABASE taskflow_test OWNER taskflow_admin;
GRANT CONNECT, CREATE ON DATABASE taskflow_test TO taskflow_app;
\connect taskflow_test
GRANT USAGE, CREATE ON SCHEMA public TO taskflow_app;
