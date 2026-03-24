import { FadeInDown, FadeIn, FadeInUp } from 'react-native-reanimated';
import { tokens } from './tokens';

/**
 * Reusable Reanimated entering animation presets.
 * All durations and delays reference design tokens — no magic numbers.
 */

/** Standard card/item entry with stagger — use on list items in map() */
export const cardEnter = (index: number) =>
  FadeInDown
    .delay(index * tokens.timing.listItem)
    .duration(tokens.timing.slideIn)
    .springify();

/** Lighter list item entry — less spring, faster */
export const listItemEnter = (index: number) =>
  FadeInDown
    .delay(index * tokens.timing.listItem)
    .duration(tokens.timing.normal);

/** Simple content fade-in */
export const fadeEnter = () =>
  FadeIn.duration(tokens.timing.fadeIn);

/** Section-level staggered entry */
export const sectionEnter = (index: number) =>
  FadeInDown
    .delay(index * tokens.timing.sectionEntry)
    .duration(tokens.timing.slideIn);

/** Slide up from bottom — for modals, sheets */
export const slideUpEnter = (delay = 0) =>
  FadeInUp.delay(delay).duration(tokens.timing.slow);
