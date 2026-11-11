// The setting "Props in FPV view" of Propwash 0.6.0 (drone render settings, on by default; off hides the own props
// with their motors and arms in the FPV image) as a switch in the simulator's bar, next to the camera buttons. The
// choice stays in the browser (localStorage, FPV_PROPS_KEY).

import { t } from './i18n.js?v=f01636b9';
import { FPV_PROPS_KEY } from './prop-view.js?v=da7a50d0';

// A text of i18n.js, else the English text given here (until the key is there).
const text = (key, english) => {
  const value = t(key);
  return value === key ? english : value;
};

/**
 * Adds the switch to the bar and applies the stored setting to the scene.
 * @param {{setFpvProps: (on: boolean) => void}} scene
 * @param {Element|null} [group] where the switch goes (the camera buttons)
 * @returns {HTMLButtonElement|null}
 */
export function mountFpvPropsSetting(scene, group = document.querySelector('.sim__views')) {
  let on = true;
  try {
    on = localStorage.getItem(FPV_PROPS_KEY) !== 'off';
  } catch { /* storage unavailable */ }
  scene.setFpvProps(on);
  if (!group) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sim__btn';
  button.setAttribute('data-fpv-props', '');
  const show = () => {
    // i18n: view.fpvProps
    button.textContent = text('view.fpvProps', 'Props');
    // i18n: view.fpvPropsTitle
    button.title = text('view.fpvPropsTitle', 'Props in FPV view: your own props with their motors and arms, where the camera sees them');
    button.setAttribute('aria-pressed', String(on));
  };
  show();
  button.addEventListener('click', () => {
    on = !on;
    try {
      localStorage.setItem(FPV_PROPS_KEY, on ? 'on' : 'off');
    } catch { /* storage unavailable */ }
    scene.setFpvProps(on);
    show();
  });
  group.append(button);
  // The page switches its language without a reload.
  new MutationObserver(show).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return button;
}
