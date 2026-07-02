#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE USER identity WITH PASSWORD 'identity';
  CREATE DATABASE identity_platform OWNER identity;
  CREATE USER keycloak WITH PASSWORD 'keycloak';
  CREATE DATABASE keycloak OWNER keycloak;
EOSQL
