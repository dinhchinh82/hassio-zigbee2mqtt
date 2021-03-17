/* eslint-disable */
const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const e = exposes.presets;
const ea = exposes.access;
const bind = async (endpoint, target, clusters) => {
    for (const cluster of clusters) {
        await endpoint.bind(cluster, target);
    }
};
const getOptions = (definition, entity) => {
    const result = {};
    const allowed = ['disableDefaultResponse', 'manufacturerCode', 'timeout'];
    if (definition && definition.meta) {
        for (const key of Object.keys(definition.meta)) {
            if (allowed.includes(key)) {
                const value = definition.meta[key];
                result[key] = typeof value === 'function' ? value(entity) : value;
            }
        }
    }
    return result;
};
function utf8FromStr(s) {
    const a = [];
    for (let i = 0, enc = encodeURIComponent(s); i < enc.length;) {
        if (enc[i] === '%') {
            a.push(parseInt(enc.substr(i + 1, 2), 16));
            i += 3;
        } else {
            a.push(enc.charCodeAt(i++));
        }
    }
    return a;
}
const fz_new = {
    javis_lock_report_test: {
        cluster: 'genBasic',
        type: 'attributeReport',
        convert: (model, msg, publish, options, meta) => {
            const lookup = {
                0: 'pairing',
                1: 'keypad',
                2: 'rfid_card_unlock',
                3: 'touch_unlock',
            };
            const data = utf8FromStr(msg['data']['16896']);
            return {
                action: 'unlock',
                action_user: data[3],
                action_source: data[5],
                action_source_name: lookup[data[5]],
            };
        },
    },    
    tuya_cover: {
        cluster: 'manuSpecificTuya',
        type: ['commandSetDataResponse', 'commandGetData'],
        convert: (model, msg, publish, options, meta) => {
            const dp = msg.data.dp;
            const value = tuya.getDataValue(msg.data.datatype, msg.data.data);

            // Protocol description
            // https://github.com/Koenkk/zigbee-herdsman-converters/issues/1159#issuecomment-614659802

            switch (dp) {
            case tuya.dataPoints.state: // Confirm opening/closing/stopping (triggered from Zigbee)
            case tuya.dataPoints.coverPosition: // Started moving to position (triggered from Zigbee)
            case tuya.dataPoints.coverChange: // Started moving (triggered by transmitter oder pulling on curtain)
                return {running: true};
            case tuya.dataPoints.coverArrived: { // Arrived at position
                const position = options.invert_cover ? (value & 0xFF) : 100 - (value & 0xFF);

                if (position > 0 && position <= 100) {
                    return {running: false, position: position};
                } else if (position == 0) { // Report fully closed
                    return {running: false, position: position};
                } else {
                    return {running: false}; // Not calibrated yet, no position is available
                }
            }
            case tuya.dataPoints.config: // 0x01 0x05: Returned by configuration set; ignore
                break;
            default: // Unknown code
                meta.logger.warn(`owvfni3: Unhandled DP #${dp}: ${JSON.stringify(msg.data)}`);
            }
        },
    }
}
const tz_new = {
    tuya_cover_control_fix: {
        key: ['state', 'position'],
        convertSet: async (entity, key, value, meta) => {
            // Protocol description
            // https://github.com/Koenkk/zigbee-herdsman-converters/issues/1159#issuecomment-614659802

            if (key === 'position') {
                if (value >= 0 && value <= 100) {
                    const invert = !(meta.mapped.meta && meta.mapped.meta.coverInverted ?
                        !meta.options.invert_cover : meta.options.invert_cover);
                    value = invert ? 100 - value : value;
                    await tuya.sendDataPointValue(entity, tuya.dataPoints.coverPosition, value);
                } else {
                    throw new Error('TuYa_cover_control: Curtain motor position is out of range');
                }
            } else if (key === 'state') {
                const isRoller = meta.mapped.model === 'TS0601_roller_blind';
                value = value.toLowerCase();
                switch (value) {
                case 'close':
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, isRoller ? 0 : 2);
                    break;
                case 'open':
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, isRoller ? 2 : 0);
                    break;
                case 'stop':
                    await tuya.sendDataPointEnum(entity, tuya.dataPoints.state, 1);
                    break;
                default:
                    throw new Error('TuYa_cover_control: Invalid command received');
                }
            }
        },
    }
}
const ha = {
    'switch': {
        type: 'switch',
        object_id: 'switch',
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: '{{ value_json.state }}',
            command_topic: true,
        },
    },
    'cover': {
        type: 'cover',
        object_id: 'cover',
        discovery_payload: {
            command_topic: true,
            state_topic: false,
            value_template: '{{ value_json.position }}',
            set_position_template: '{ "position": {{ position }} }',
            set_position_topic: true,
            position_topic: true
        },
    },
    'sensor_linkquality': {
        type: 'sensor',
        object_id: 'linkquality',
        discovery_payload: {
            icon: 'mdi:signal',
            unit_of_measurement: 'lqi',
            value_template: '{{ value_json.linkquality }}',
        },
    },
    'lock': {
        type: 'lock',
        object_id: 'lock',
        discovery_payload: {
            command_topic: true,
            value_template: '{{ value_json.state }}',
            state_locked: 'LOCK',
            state_unlocked: 'UNLOCK',
        },
    },
    'sensor_action': {
        type: 'sensor',
        object_id: 'action',
        discovery_payload: {
            icon: 'mdi:gesture-double-tap',
            value_template: '{{ value_json.action }}',
        },
    },
    'sensor_battery': {
        type: 'sensor',
        object_id: 'battery',
        discovery_payload: {
            unit_of_measurement: '%',
            device_class: 'battery',
            value_template: '{{ value_json.battery }}',
        },
    },
}
const device = [
    {
        fingerprint: [{ modelID: 'TS0003', manufacturerName: '_TZ3000_ksrn2wdo' }],
        model: 'TS0003_curtain_switch',
        vendor: 'JAVIS',
        description: 'Curtain switch / garage controller',
        supports: 'open, close, stop',
        fromZigbee: [fz.TS0003_curtain_swich, fz.ignore_basic_report],
        toZigbee: [tz.TS0003_curtain_switch],
        meta: { configureKey: 1 },
        configure: async (device, coordinatorEndpoint) => {
            await bind(device.getEndpoint(1), coordinatorEndpoint, ['genOnOff']);
            await bind(device.getEndpoint(2), coordinatorEndpoint, ['genOnOff']);
            await bind(device.getEndpoint(3), coordinatorEndpoint, ['genOnOff']);
        },
        exposes: [
            e.cover_position().setAccess('position', ea.STATE_SET)],
        homeassistant: [ha.cover],
    },
    {
        fingerprint: [
            { modelID: 'TS0001', manufacturerName: '_TZ3000_p37ubkjx' },
            { modelID: 'TS0001', manufacturerName: '_TZ3000_ajxu2j10' },
        ],
        model: 'TS0001_boiler',
        vendor: 'JAVIS',
        description: 'Cong tac 1 gang co N',
        supports: 'on/off',
        fromZigbee: [fz.on_off],
        toZigbee: [tz.on_off],
        meta: { configureKey: 1 },
        configure: async (device, coordinatorEndpoint) => {
            await bind(device.getEndpoint(1), coordinatorEndpoint, ['genOnOff']);
        },
        exposes: [e.switch()],
        homeassistant: [ha.switch],
    },
    {
        zigbeeModel: ['owvfni3\u0000', 'owvfni3', 'u1rkty3', 'aabybja'],
        fingerprint: [
            {modelID: 'TS0601', manufacturerName: '_TZE200_5zbp6j0u'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_nkoabg8w'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_xuzcvlku'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_4vobcgd3'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_nogaemzt'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_pk0sfzvr'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_fdtjuw7u'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_zpzndjez'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_rddyvrci'},
            {modelID: 'TS0601', manufacturerName: '_TZE200_cowvfni3'},
        ],
        model: 'TS0601_curtain',
        vendor: 'Javis',
        description: 'Curtain motor',
        whiteLabel: [
            {vendor: 'Yushun', model: 'YS-MT750'},
            {vendor: 'Zemismart', model: 'ZM79E-DT'},
            {vendor: 'Binthen', model: 'BCM100D'},
            {vendor: 'Binthen', model: 'CV01A'},
            {vendor: 'Zemismart', model: 'M515EGB'},
            {vendor: 'TuYa', model: 'DT82LEMA-1.2N'},
            {vendor: 'Moes', model: 'AM43-0.45/40-ES-EB'},
        ],
        fromZigbee: [fz_new.tuya_cover, fz.ignore_basic_report],
        toZigbee: [tz_new.tuya_cover_control_fix, tz.tuya_cover_options],        
        exposes: [
            e.cover_position().setAccess('position', ea.STATE_SET),
            exposes.composite('options', 'options')
                .withFeature(exposes.numeric('motor_speed', ea.STATE_SET)
                    .withValueMin(0)
                    .withValueMax(255)
                    .withDescription('Motor speed'))],
        homeassistant: [ha.cover, ha.sensor_linkquality]
    },
    {
        fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE200_wmcdj3aq'}],
        model: 'TS0601_roller_blind',
        vendor: 'Javis',
        description: 'Roller blind motor',
        fromZigbee: [fz_new.tuya_cover, fz.ignore_basic_report],
        toZigbee: [tz_new.tuya_cover_control_fix, tz.tuya_cover_options],       
         exposes: [
            e.cover_position().setAccess('position', ea.STATE_SET),
            exposes.composite('options', 'options')
                .withFeature(exposes.numeric('motor_speed', ea.STATE_SET)
                    .withValueMin(0)
                    .withValueMax(255)
                    .withDescription('Motor speed'))],
        homeassistant: [ha.cover, ha.sensor_linkquality]
    },
    {
        zigbeeModel: ['JAVISLOCK'],
        fingerprint: [{ modelID: 'E321V000A03', manufacturerName: 'Vensi' }],
        model: 'JS-SLK2-ZB',
        vendor: 'JAVIS',
        description: 'Intelligent biometric digital lock',
        supports: 'action',
        fromZigbee: [fz_new.javis_lock_report_test, fz.battery],
        toZigbee: [tz.generic_lock],
        meta: { configureKey: 1 },
        exposes: [e.battery(), e.action(['unlock'])],
        homeassistant: [ha.lock, ha.sensor_action, ha.sensor_battery],
    },
]
module.exports = device;