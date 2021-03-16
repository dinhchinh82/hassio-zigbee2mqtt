#!/usr/bin/with-contenv bashio
DATA_PATH=$(bashio::config 'data_path')
cp -f "$DATA_PATH"/devices.js /app/node_modules/zigbee-herdsman-converters/devices.js
cp -f "$DATA_PATH"/tuya.js /app/node_modules/zigbee-herdsman-converters/lib/tuya.js
cp -f "$DATA_PATH"/fromZigbee.js /app/node_modules/zigbee-herdsman-converters/converters/fromZigbee.js
cp -f "$DATA_PATH"/toZigbee.js /app/node_modules/zigbee-herdsman-converters/converters/toZigbee.js