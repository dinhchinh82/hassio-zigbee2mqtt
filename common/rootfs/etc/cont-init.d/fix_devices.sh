#!/usr/bin/with-contenv bashio
DATA_PATH=$(bashio::config 'data_path')
cp -f "$DATA_PATH"/devices.js /app/node_modules/zigbee-herdsman-converters/devices.js