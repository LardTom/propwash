// Texts of the simulator page: ['English', 'Deutsch'] per key, like the configurator's texts. On the English and German
// pages the page language (<html lang>) picks one; on a translated page (/es/sim/, …) t() gives the translation of the
// English text from assets/i18n/<lang>.json (tools/i18n/pages.mjs lists this file as "js-arrays"; call loadTexts()
// before the first text).

import { translated, lookup, load, lang as pageLang } from '../i18n.js?v=6ae64da4';

const TEXT = {
  'stick.throttle': ['Throttle', 'Gas'],
  'stick.yaw': ['Yaw', 'Gier'],
  'stick.pitch': ['Pitch', 'Nick'],
  'stick.roll': ['Roll', 'Roll'],
  'fn.arm': ['Arm', 'Scharf schalten'],
  'fn.angle': ['Angle mode', 'Angle-Modus'],
  'fn.horizon': ['Horizon mode', 'Horizon-Modus'],
  'fn.reset': ['Reset', 'Zurücksetzen'],
  'fn.flip': ['Flip upright', 'Aufrichten'],
  'setup.device': ['Device', 'Gerät'],
  'setup.auto': ['Automatic (radio first, then gamepad, else keyboard)', 'Automatisch (erst Funke, dann Gamepad, sonst Tastatur)'],
  'setup.radio': ['Radio', 'Funke'],
  'setup.gamepad': ['Gamepad', 'Gamepad'],
  'setup.keyboard': ['Keyboard', 'Tastatur'],
  'setup.noPads': ['No controller found. Connect your radio via USB and choose “USB Joystick (HID)” on it, or plug in a gamepad, then press any button or move a stick.', 'Kein Controller gefunden. Verbinde deine Funke per USB und wähle dort „USB Joystick (HID)“, oder steck ein Gamepad an – dann eine Taste drücken oder einen Knüppel bewegen.'],
  'setup.keyboardHelp': ['W/S throttle, A/D yaw, arrow keys pitch and roll, Z arm, R flight mode, Backspace reset, U flip upright, C camera. Keyboard flight starts in Angle mode.', 'W/S Gas, A/D Gier, Pfeiltasten Nick und Roll, Z scharf schalten, R Flugmodus, Rücktaste zurücksetzen, U aufrichten, C Kamera. Tastaturflug startet im Angle-Modus.'],
  'setup.stickMode': ['Stick mode', 'Knüppel-Mode'],
  'setup.stickModeNote': ['Left stick vertical / horizontal · right stick vertical / horizontal. A radio keeps its channels (set the mode on the radio itself); a gamepad’s sticks follow the mode unless you mapped them yourself.', 'Linker Knüppel senkrecht / waagrecht · rechter Knüppel senkrecht / waagrecht. Eine Funke behält ihre Kanäle (den Mode stellst du an der Funke ein); die Knüppel eines Gamepads folgen dem Mode, solange du sie nicht selbst zugeordnet hast.'],
  'setup.live': ['Live check', 'Live-Prüfung'],
  'setup.channels': ['Channels', 'Kanäle'],
  'setup.axis': ['Axis', 'Achse'],
  'setup.invert': ['Inv.', 'Inv.'],
  'setup.detect': ['Detect', 'Erkennen'],
  'setup.throttleMode': ['Throttle', 'Gas'],
  'setup.throttleFull': ['Full travel', 'Voller Weg'],
  'setup.throttleUpper': ['Upper half (centred stick = off)', 'Obere Hälfte (Mitte = aus)'],
  'setup.calibrate': ['Calibrate', 'Kalibrieren'],
  'setup.calibrated': ['Calibrated.', 'Kalibriert.'],
  'setup.notCalibrated': ['Not calibrated yet – recommended for radios.', 'Noch nicht kalibriert – für Funken empfohlen.'],
  'setup.switches': ['Switches', 'Schalter'],
  'setup.unassigned': ['not assigned', 'nicht belegt'],
  'setup.button': ['Button', 'Taste'],
  'setup.toggle': ['toggle', 'Umschalten'],
  'setup.assign': ['Assign', 'Belegen'],
  'setup.clear': ['Clear', 'Löschen'],
  'setup.switchNote': ['Radio default: AUX1 = arm, AUX2 = flight mode (low Acro, middle Horizon, high Angle). Without a mode switch the drone flies Acro; R on the keyboard switches modes.', 'Standard der Funke: AUX1 = scharf, AUX2 = Flugmodus (unten Acro, Mitte Horizon, oben Angle). Ohne Modusschalter fliegt die Drohne Acro; R auf der Tastatur wechselt den Modus.'],
  'setup.defaults': ['Reset this device to defaults', 'Dieses Gerät auf Standard zurücksetzen'],
  'setup.pushThrottle': ['Push the throttle stick fully up.', 'Gasknüppel ganz nach oben schieben.'],
  'setup.push.yaw': ['Push the yaw stick fully right.', 'Gierknüppel ganz nach rechts.'],
  'setup.push.pitch': ['Push the pitch stick fully up (forward).', 'Nickknüppel ganz nach oben (vorwärts).'],
  'setup.push.roll': ['Push the roll stick fully right.', 'Rollknüppel ganz nach rechts.'],
  'setup.flip': ['Flip the switch or press the button for “{fn}” – into the position where it should be active.', 'Schalter umlegen oder Taste drücken für „{fn}“ – in die Stellung, in der es aktiv sein soll.'],
  'setup.calCenter': ['Centre all sticks, throttle fully down, then press Next.', 'Alle Knüppel mittig, Gas ganz unten, dann Weiter.'],
  'setup.calRange': ['Move both sticks around their full range several times (all corners), then press Done.', 'Beide Knüppel mehrmals über den ganzen Weg bewegen (alle Ecken), dann Fertig.'],
  'setup.next': ['Next', 'Weiter'],
  'setup.done': ['Done', 'Fertig'],
  'setup.cancel': ['Cancel', 'Abbrechen'],
  'ui.loading': ['Loading the flying field …', 'Flugplatz wird geladen …'],
  'ui.loadFailed': ['The simulator could not load. Reload the page to try again.', 'Der Simulator konnte nicht geladen werden. Lade die Seite neu, um es noch einmal zu versuchen.'],
  'ui.noWebgl': ['Your browser has WebGL switched off, so the simulator cannot draw the 3D view.', 'In deinem Browser ist WebGL ausgeschaltet, deshalb kann der Simulator die 3D-Ansicht nicht zeichnen.'],
  'ui.badCode': ['This share code could not be read, so you are flying the default drone.', 'Dieser Sharecode ließ sich nicht lesen, du fliegst die Standarddrohne.'],
  'ui.cannotFly': ['This build cannot fly (unknown part). Flying the default drone instead.', 'Dieser Aufbau kann nicht fliegen (unbekanntes Teil). Du fliegst stattdessen die Standarddrohne.'],
  'view.fpv': ['FPV', 'FPV'],
  'view.los': ['Line of sight', 'Sichtflug'],
  'view.fpvProps': ['Props', 'Props'],
  'view.fpvPropsTitle': ['Props in FPV view: your own props with their motors and arms, where the camera sees them', 'Props im FPV-Bild: die eigenen Props samt Motoren und Armen, dort wo die Kamera sie sieht'],
  'msg.crash': ['CRASH', 'CRASH'],
  'msg.armed': ['ARMED', 'SCHARF'],
  'msg.reset': ['RESET', 'ZURÜCKGESETZT'],
  'msg.blocked': ['ARMING BLOCKED', 'SCHARFSCHALTEN BLOCKIERT'],
  'device.keyboard': ['Keyboard', 'Tastatur'],
  'device.radio': ['Radio', 'Funke'],
  'device.gamepad': ['Gamepad', 'Gamepad'],
};

/** Loads the translations of a translated page (nothing to do on the English and German pages). */
export const loadTexts = () => load();

/** 'en' or 'de' on the official pages, the page language (es, fr, …) on a translated page. */
export function lang() {
  return pageLang();
}

/** True on a page of the official languages that shows German. */
export function isGerman() {
  return !translated() && document.documentElement.lang === 'de';
}

export function t(key) {
  const pair = TEXT[key];
  if (!pair) return key;
  if (translated()) return lookup(pair[0]);
  return pair[isGerman() ? 1 : 0];
}
