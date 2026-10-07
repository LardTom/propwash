// PW2 share-code tables (sharecode.md, PW2 revision 2.0), identical to Pw2Tables in Just More Parts. Append only:
// a part, colour or dictionary byte never changes its place. The web export carries the same tables
// (sharecode/spec.json, pw2) and tools/test-configurator.mjs compares them.

/** Part tables by kind; code value v >= 1 means PARTS[kind][v - 1]. */
export const PW2_PARTS = Object.freeze({
  frame: Object.freeze([
    'propwash:cinewhoop_3', 'propwash:freestyle_5', 'propwash:long_range_7', 'propwash:race_5', 'propwash:whoop_65',
    'justmoreparts:cw_25_duct', 'justmoreparts:cw_35_duct', 'justmoreparts:deadcat_5', 'justmoreparts:fs_5_bash',
    'justmoreparts:fs_5_squashed', 'justmoreparts:hframe_5', 'justmoreparts:lr_4_x', 'justmoreparts:lr_6_x',
    'justmoreparts:lr_7_deadcat', 'justmoreparts:lr_8_x', 'justmoreparts:race_5_stretched', 'justmoreparts:tp_25_x',
    'justmoreparts:tp_2_x', 'justmoreparts:tp_35_stretched', 'justmoreparts:tp_3_x', 'justmoreparts:whoop_65_lite',
    'justmoreparts:whoop_75_duct', 'justmoreparts:whoop_85_duct', 'justmoreparts:xclass_10',
    'justmoreparts:xclass_12', 'justmoreparts:xclass_13', 'justmoreparts:xclass_13_h'
  ]),
  stack: Object.freeze([
    'propwash:aio_20', 'propwash:aio_whoop', 'propwash:stack_30', 'propwash:creative_fc',
    'justmoreparts:aio_20_4s_35a', 'justmoreparts:aio_20_6s_45a', 'justmoreparts:aio_tp_4s_20a',
    'justmoreparts:aio_tp_6s_20a', 'justmoreparts:aio_whoop_1s_6a', 'justmoreparts:aio_whoop_2s_12a',
    'justmoreparts:stack_20_6s_40a', 'justmoreparts:stack_30_4s_55a', 'justmoreparts:stack_30_6s_60a',
    'justmoreparts:stack_30_6s_80a', 'justmoreparts:stack_30_8s_100a', 'justmoreparts:stack_30_8s_65a'
  ]),
  motor: Object.freeze([
    'propwash:m0802_22000', 'propwash:m1404_4600', 'propwash:m2004_3000', 'propwash:m2207_1750',
    'propwash:m2306_1860', 'propwash:m2807_1300', 'justmoreparts:m0702_23000', 'justmoreparts:m0702_27000',
    'justmoreparts:m0802_15500', 'justmoreparts:m0802_19000', 'justmoreparts:m1102_13500',
    'justmoreparts:m1102_18000', 'justmoreparts:m1103_11000', 'justmoreparts:m1103_8000',
    'justmoreparts:m12025_11500', 'justmoreparts:m12025_5500', 'justmoreparts:m1404_2750',
    'justmoreparts:m1404_3800', 'justmoreparts:m1505_2500', 'justmoreparts:m1505_3600', 'justmoreparts:m2004_1700',
    'justmoreparts:m22075_1850', 'justmoreparts:m22075_2700', 'justmoreparts:m2207_1500', 'justmoreparts:m2207_1950',
    'justmoreparts:m2207_2550', 'justmoreparts:m23065_2020', 'justmoreparts:m23065_2450', 'justmoreparts:m2507_1500',
    'justmoreparts:m2507_1800', 'justmoreparts:m28065_1050', 'justmoreparts:m28065_1300', 'justmoreparts:m2807_1100',
    'justmoreparts:m2807_1500', 'justmoreparts:m3115_1050', 'justmoreparts:m3115_640', 'justmoreparts:m3115_900',
    'justmoreparts:m4214_330', 'justmoreparts:m4214_400', 'justmoreparts:m4214_530'
  ]),
  prop: Object.freeze([
    'propwash:p31_3b', 'propwash:p31_4b', 'propwash:p3_3b', 'propwash:p51_3b', 'propwash:p7_2b',
    'justmoreparts:p102_25_2b_pc', 'justmoreparts:p102_30_3b_gfn', 'justmoreparts:p130_35_4b_pc',
    'justmoreparts:p130_36_3b_bi', 'justmoreparts:p130_40_2b_pc', 'justmoreparts:p130_41_3b_soft',
    'justmoreparts:p130_46_3b_hard', 'justmoreparts:p130_50_3b_gfn', 'justmoreparts:p152_33_3b_pc',
    'justmoreparts:p152_40_2b_gfn', 'justmoreparts:p178_35_3b_pc', 'justmoreparts:p178_40_2b_cfn',
    'justmoreparts:p178_45_3b_gfn', 'justmoreparts:p203_40_3b_gfn', 'justmoreparts:p203_45_2b_cfn',
    'justmoreparts:p254_45_3b_cfn', 'justmoreparts:p254_50_2b_carbon', 'justmoreparts:p305_60_2b_cfn',
    'justmoreparts:p31_12_4b_hard', 'justmoreparts:p31_14_3b_bi', 'justmoreparts:p31_16_2b_pc',
    'justmoreparts:p330_60_3b_cfn', 'justmoreparts:p330_70_2b_carbon', 'justmoreparts:p40_14_5b_soft',
    'justmoreparts:p40_15_4b_pc', 'justmoreparts:p40_17_3b_pc', 'justmoreparts:p40_20_2b_pc',
    'justmoreparts:p45_17_4b_bi', 'justmoreparts:p45_19_3b_pc', 'justmoreparts:p51_18_4b_pc',
    'justmoreparts:p51_20_3b_pc', 'justmoreparts:p65_22_4b_bi', 'justmoreparts:p65_25_3b_pc',
    'justmoreparts:p76_24_5b_pc_duct', 'justmoreparts:p76_25_3b_hard', 'justmoreparts:p76_30_2b_pc',
    'justmoreparts:p89_25_5b_pc_duct', 'justmoreparts:p89_30_3b_pc'
  ]),
  video: Object.freeze([
    'propwash:analog_nano', 'propwash:analog_race', 'propwash:digital_hd', 'propwash:digital_lite',
    'justmoreparts:analog_lr_1600', 'justmoreparts:analog_race_800', 'justmoreparts:analog_whoop_25mw',
    'justmoreparts:digital_hd_pro', 'justmoreparts:digital_low_latency', 'justmoreparts:digital_lr',
    'justmoreparts:digital_micro'
  ]),
  battery: Object.freeze([
    'propwash:b1s_300_hv', 'propwash:b4s_650', 'propwash:b6s_1100', 'propwash:b6s_1300', 'propwash:b6s_4000_lion',
    'justmoreparts:b1s_250_hv', 'justmoreparts:b1s_380_hv', 'justmoreparts:b1s_450_hv', 'justmoreparts:b1s_550_hv',
    'justmoreparts:b1s_750_hv', 'justmoreparts:b2s_300_hv', 'justmoreparts:b2s_450_hv', 'justmoreparts:b2s_650',
    'justmoreparts:b3s_450', 'justmoreparts:b3s_650', 'justmoreparts:b4s_1100', 'justmoreparts:b4s_1500',
    'justmoreparts:b4s_1800', 'justmoreparts:b4s_450', 'justmoreparts:b4s_850', 'justmoreparts:b6s_1500',
    'justmoreparts:b6s_1800', 'justmoreparts:b6s_2200', 'justmoreparts:b6s_3000_lion', 'justmoreparts:b6s_3000_ss',
    'justmoreparts:b6s_4500_lion', 'justmoreparts:b6s_5000', 'justmoreparts:b6s_550', 'justmoreparts:b6s_750',
    'justmoreparts:b6s_8400_lion', 'justmoreparts:b6s_850', 'justmoreparts:b8s_2200', 'justmoreparts:b8s_4500_lion',
    'justmoreparts:b8s_5000', 'justmoreparts:b8s_5000_ss'
  ]),
  accessory: Object.freeze([
    'propwash:action_cam_heavy', 'propwash:action_cam_light', 'propwash:led_strip', 'propwash:action_cam_flashback',
    'propwash:gripper'
  ]),
});

/** Colour table (Propwash paint swatches, then the colours of the Just More Parts presets); frozen, never extended. */
export const PW2_COLORS = Object.freeze([
  0xf9fffe, 0x9d9d97, 0x474f52, 0x1d1d21, 0x835432, 0xb02e26, 0xf9801d, 0xfed83d, 0x80c71f, 0x5e7c16, 0x169c9c,
  0x3ab3da, 0x3c44aa, 0x8932b8, 0xc74ebd, 0xf38baa, 0x2a2c30, 0x4e535b, 0xb8bec6, 0xd8a93b, 0xb8693a, 0x3fb950,
  0xe6edf3, 0x2f81f7, 0xf0f6fc, 0x1b1d20, 0xf5c518, 0xa371f7, 0x19b3a6, 0xe5534b, 0xc9d1d9, 0xd29922, 0x30363d,
  0xcf222e, 0x2d1b45, 0x8250df, 0x1a7f37, 0x2da44e, 0x0b3d91, 0x0969da, 0x54aeff, 0xff7b29, 0xbf8700, 0xfb8f44,
  0x7ee787, 0x1f6feb, 0x79c0ff, 0xe16f24, 0xf778ba, 0xffd33d, 0xff4d4d
]);

// OSD layouts of the four presets of Propwash 0.4.0 (full, standard, race, minimal = default) as the preset dictionary
// of the raw DEFLATE stream in the OSD layer.
const OSD_FULL = '{"v":1,"preset":"full","style":{"opacity":60,"line_opacity":60,"scale":1.0,"color":"#ffffff","warning_color":"'
  + '#ff4a4a","outline":"thin","background":"off","colored_alerts":true,"pitch_ladder":true,"ladder_step_deg":10.0}'
  + ',"elements":{"crosshair":{"on":true},"artificial_horizon":{"on":true},"horizon_sidebars":{"on":true},"home_mar'
  + 'ker":{"on":true},"compass_bar":{"on":true,"col":15,"row":0},"heading":{"on":true,"col":15,"row":1},"home_direc'
  + 'tion":{"on":true,"col":13,"row":2},"home_distance":{"on":true,"col":14,"row":2},"link_quality":{"on":true,"col'
  + '":1,"row":1},"video_signal":{"on":true,"col":1,"row":2},"rssi_dbm":{"on":true,"col":1,"row":3},"gate":{"on":tr'
  + 'ue,"col":1,"row":4},"speed":{"on":true,"col":1,"row":7},"pitch_angle":{"on":true,"col":1,"row":9},"roll_angle"'
  + ':{"on":true,"col":1,"row":10},"battery_bar":{"on":true,"col":1,"row":11},"current":{"on":true,"col":1,"row":12'
  + '},"power":{"on":true,"col":5,"row":12},"mah_drawn":{"on":true,"col":1,"row":13},"battery_voltage":{"on":true,"'
  + 'col":1,"row":14},"cell_voltage":{"on":true,"col":5,"row":14},"coordinates":{"on":true,"col":1,"row":15},"post_'
  + 'flight_stats":{"on":true,"col":15,"row":1},"split_delta":{"on":true,"col":15,"row":5},"armed_status":{"on":tru'
  + 'e,"col":15,"row":9},"warnings":{"on":true,"col":15,"row":10},"stick_overlay":{"on":true,"col":15,"row":12},"cr'
  + 'aft_name":{"on":true,"col":15,"row":14},"video_system":{"on":true,"col":28,"row":1},"clock":{"on":true,"col":2'
  + '8,"row":11},"on_time":{"on":true,"col":28,"row":3},"lap":{"on":true,"col":28,"row":4},"lap_time":{"on":true,"c'
  + 'ol":28,"row":5},"last_lap":{"on":true,"col":28,"row":6},"best_lap":{"on":true,"col":28,"row":7},"altitude":{"o'
  + 'n":true,"col":28,"row":8},"vario":{"on":true,"col":28,"row":9},"g_force":{"on":true,"col":28,"row":10},"flight'
  + '_mode":{"on":true,"col":28,"row":12},"throttle":{"on":true,"col":28,"row":13},"flight_time":{"on":true,"col":2'
  + '8,"row":14},"recording":{"on":true,"col":28,"row":2},"leds_off":{"on":true,"col":1,"row":5},"gps_sats":{"on":t'
  + 'rue,"col":28,"row":15},"vtx_channel":{"on":true,"col":1,"row":6},"tricks":{"on":true,"col":15,"row":13}}}';
const OSD_STANDARD = '{"v":1,"preset":"standard","style":{"opacity":60,"line_opacity":60,"scale":1.0,"color":"#ffffff","warning_colo'
  + 'r":"#ff4a4a","outline":"thin","background":"off","colored_alerts":true,"pitch_ladder":true,"ladder_step_deg":1'
  + '0.0},"elements":{"crosshair":{"on":true},"artificial_horizon":{"on":false},"horizon_sidebars":{"on":false},"ho'
  + 'me_marker":{"on":false},"compass_bar":{"on":false,"col":15,"row":0},"heading":{"on":false,"col":15,"row":1},"h'
  + 'ome_direction":{"on":true,"col":13,"row":1},"home_distance":{"on":true,"col":14,"row":1},"link_quality":{"on":'
  + 'true,"col":1,"row":1},"video_signal":{"on":true,"col":1,"row":2},"rssi_dbm":{"on":false,"col":1,"row":3},"gate'
  + '":{"on":true,"col":1,"row":4},"speed":{"on":true,"col":1,"row":12},"pitch_angle":{"on":false,"col":1,"row":9},'
  + '"roll_angle":{"on":false,"col":1,"row":10},"battery_bar":{"on":false,"col":1,"row":11},"current":{"on":false,"'
  + 'col":1,"row":12},"power":{"on":false,"col":5,"row":12},"mah_drawn":{"on":true,"col":1,"row":13},"battery_volta'
  + 'ge":{"on":true,"col":1,"row":14},"cell_voltage":{"on":true,"col":5,"row":14},"coordinates":{"on":false,"col":1'
  + ',"row":15},"post_flight_stats":{"on":true,"col":15,"row":1},"split_delta":{"on":true,"col":15,"row":5},"armed_'
  + 'status":{"on":true,"col":15,"row":9},"warnings":{"on":true,"col":15,"row":10},"stick_overlay":{"on":false,"col'
  + '":15,"row":12},"craft_name":{"on":false,"col":15,"row":14},"video_system":{"on":false,"col":28,"row":1},"clock'
  + '":{"on":false,"col":28,"row":11},"on_time":{"on":false,"col":28,"row":3},"lap":{"on":true,"col":28,"row":3},"l'
  + 'ap_time":{"on":true,"col":28,"row":4},"last_lap":{"on":false,"col":28,"row":6},"best_lap":{"on":true,"col":28,'
  + '"row":5},"altitude":{"on":true,"col":28,"row":12},"vario":{"on":false,"col":28,"row":9},"g_force":{"on":false,'
  + '"col":28,"row":10},"flight_mode":{"on":true,"col":28,"row":1},"throttle":{"on":true,"col":28,"row":13},"flight'
  + '_time":{"on":true,"col":28,"row":14},"recording":{"on":true,"col":28,"row":2},"leds_off":{"on":true,"col":1,"r'
  + 'ow":3},"gps_sats":{"on":true,"col":28,"row":11},"vtx_channel":{"on":true,"col":1,"row":5},"tricks":{"on":true,'
  + '"col":15,"row":13}}}';
const OSD_RACE = '{"v":1,"preset":"race","style":{"opacity":60,"line_opacity":60,"scale":1.0,"color":"#ffffff","warning_color":"'
  + '#ff4a4a","outline":"thin","background":"off","colored_alerts":true,"pitch_ladder":true,"ladder_step_deg":10.0}'
  + ',"elements":{"crosshair":{"on":true},"artificial_horizon":{"on":false},"horizon_sidebars":{"on":false},"home_m'
  + 'arker":{"on":false},"compass_bar":{"on":false,"col":15,"row":0},"heading":{"on":false,"col":15,"row":1},"home_'
  + 'direction":{"on":false,"col":13,"row":2},"home_distance":{"on":false,"col":14,"row":2},"link_quality":{"on":tr'
  + 'ue,"col":1,"row":1},"video_signal":{"on":true,"col":1,"row":2},"rssi_dbm":{"on":false,"col":1,"row":3},"gate":'
  + '{"on":true,"col":1,"row":4},"speed":{"on":true,"col":1,"row":13},"pitch_angle":{"on":false,"col":1,"row":9},"r'
  + 'oll_angle":{"on":false,"col":1,"row":10},"battery_bar":{"on":false,"col":1,"row":11},"current":{"on":false,"co'
  + 'l":1,"row":12},"power":{"on":false,"col":5,"row":12},"mah_drawn":{"on":false,"col":1,"row":13},"battery_voltag'
  + 'e":{"on":true,"col":1,"row":14},"cell_voltage":{"on":false,"col":5,"row":14},"coordinates":{"on":false,"col":1'
  + ',"row":15},"post_flight_stats":{"on":false,"col":15,"row":3},"split_delta":{"on":true,"col":15,"row":4},"armed'
  + '_status":{"on":true,"col":15,"row":9},"warnings":{"on":true,"col":15,"row":10},"stick_overlay":{"on":false,"co'
  + 'l":15,"row":12},"craft_name":{"on":false,"col":15,"row":14},"video_system":{"on":false,"col":28,"row":1},"cloc'
  + 'k":{"on":false,"col":28,"row":11},"on_time":{"on":false,"col":28,"row":3},"lap":{"on":true,"col":28,"row":2},"'
  + 'lap_time":{"on":true,"col":28,"row":3},"last_lap":{"on":true,"col":28,"row":4},"best_lap":{"on":true,"col":28,'
  + '"row":5},"altitude":{"on":false,"col":28,"row":8},"vario":{"on":false,"col":28,"row":9},"g_force":{"on":false,'
  + '"col":28,"row":10},"flight_mode":{"on":false,"col":28,"row":12},"throttle":{"on":true,"col":28,"row":14},"flig'
  + 'ht_time":{"on":false,"col":28,"row":14},"recording":{"on":true,"col":28,"row":1},"leds_off":{"on":true,"col":1'
  + ',"row":3},"gps_sats":{"on":false,"col":28,"row":15},"vtx_channel":{"on":true,"col":1,"row":5},"tricks":{"on":f'
  + 'alse,"col":15,"row":13}}}';
const OSD_MINIMAL = '{"v":1,"preset":"minimal","style":{"opacity":60,"line_opacity":60,"scale":1.0,"color":"#ffffff","warning_color'
  + '":"#ff4a4a","outline":"thin","background":"off","colored_alerts":true,"pitch_ladder":true,"ladder_step_deg":10'
  + '.0},"elements":{"crosshair":{"on":true},"artificial_horizon":{"on":false},"horizon_sidebars":{"on":false},"hom'
  + 'e_marker":{"on":false},"compass_bar":{"on":false,"col":15,"row":0},"heading":{"on":false,"col":15,"row":1},"ho'
  + 'me_direction":{"on":false,"col":13,"row":2},"home_distance":{"on":false,"col":14,"row":2},"link_quality":{"on"'
  + ':true,"col":1,"row":1},"video_signal":{"on":true,"col":1,"row":2},"rssi_dbm":{"on":false,"col":1,"row":3},"gat'
  + 'e":{"on":false,"col":1,"row":4},"speed":{"on":false,"col":1,"row":7},"pitch_angle":{"on":false,"col":1,"row":9'
  + '},"roll_angle":{"on":false,"col":1,"row":10},"battery_bar":{"on":false,"col":1,"row":11},"current":{"on":false'
  + ',"col":1,"row":12},"power":{"on":false,"col":5,"row":12},"mah_drawn":{"on":false,"col":1,"row":13},"battery_vo'
  + 'ltage":{"on":true,"col":1,"row":14},"cell_voltage":{"on":false,"col":5,"row":14},"coordinates":{"on":false,"co'
  + 'l":1,"row":15},"post_flight_stats":{"on":false,"col":15,"row":3},"split_delta":{"on":false,"col":15,"row":5},"'
  + 'armed_status":{"on":false,"col":15,"row":9},"warnings":{"on":true,"col":15,"row":3},"stick_overlay":{"on":fals'
  + 'e,"col":15,"row":12},"craft_name":{"on":false,"col":15,"row":14},"video_system":{"on":false,"col":28,"row":1},'
  + '"clock":{"on":false,"col":28,"row":11},"on_time":{"on":false,"col":28,"row":3},"lap":{"on":true,"col":28,"row"'
  + ':3},"lap_time":{"on":true,"col":28,"row":4},"last_lap":{"on":false,"col":28,"row":6},"best_lap":{"on":false,"c'
  + 'ol":28,"row":7},"altitude":{"on":false,"col":28,"row":8},"vario":{"on":false,"col":28,"row":9},"g_force":{"on"'
  + ':false,"col":28,"row":10},"flight_mode":{"on":true,"col":28,"row":2},"throttle":{"on":false,"col":28,"row":13}'
  + ',"flight_time":{"on":true,"col":28,"row":14},"recording":{"on":true,"col":28,"row":1},"leds_off":{"on":true,"c'
  + 'ol":1,"row":3},"gps_sats":{"on":false,"col":28,"row":15},"vtx_channel":{"on":true,"col":1,"row":5},"tricks":{"'
  + 'on":true,"col":15,"row":13}}}';
export const PW2_OSD_DICTIONARY = new TextEncoder().encode(OSD_FULL + OSD_STANDARD + OSD_RACE + OSD_MINIMAL);
