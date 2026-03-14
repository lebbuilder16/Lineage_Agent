# Mobile Learning App Guidelines

## Core Design Principles

### Mobile-First Approach
* **NO HOVER EFFECTS**: Hover states are useless on mobile devices and can cause touch interaction issues
* **Touch-Optimized**: All interactions should be designed for touch input only
* **Use whileTap instead of whileHover**: For Motion components, only use `whileTap` for touch feedback
* **Minimum Touch Target Size**: All interactive elements should be at least 44px × 44px for accessibility

### Glass Morphism System
* **Consistent Blur**: Use `backdrop-blur-lg` (16px) for all glass morphism effects
* **Unified Background**: Always use `bg-card-glass` or `bg-glass` utility classes
* **Consistent Borders**: Use `border border-white/20` for glass morphism borders
* **Shadow Hierarchy**: Use CSS custom properties for consistent shadow system

### Animation & Interaction Guidelines
* **Touch Feedback Only**: Use `whileTap={{ scale: 0.95 }}` for button press feedback
* **No Scale Hover Effects**: Remove all `whileHover` scaling effects
* **Keep Animations Subtle**: Scale effects should be minimal (0.95-1.05 range)
* **Performance First**: Prefer transform animations over layout changes

### Typography System
* **Never Override Base Typography**: Do not use Tailwind font size/weight classes unless specifically requested
* **Use CSS Custom Properties**: Typography is controlled by the design system in globals.css
* **Lexend Font Family**: All text uses Lexend for consistency and readability

### Color System
* **Primary**: #091A7A (Deep Navy Blue)
* **Secondary**: #ADC8FF (Light Blue)
* **Success**: #10B981
* **Warning**: #F59E0B
* **Error**: #EF4444
* **Neutral**: #6B7280

### Component Standards
* **Consistent Border Radius**: Use CSS custom properties (--radius-small, --radius-standard, etc.)
* **Glass Morphism Cards**: All cards should use the standardized glass morphism system
* **Touch-Safe Spacing**: Minimum 16px spacing between interactive elements
* **No Cursor Pointers**: Cursor styles are irrelevant on mobile devices

### Performance Optimizations
* **Minimize Re-renders**: Use proper React optimization techniques
* **Efficient Animations**: Use transform-based animations for 60fps performance
* **Touch Responsiveness**: Interactions should feel immediate (no delays)
* **Memory Management**: Clean up intervals and listeners properly

### Accessibility
* **Color Contrast**: Ensure WCAG AA compliance for all text
* **Touch Accessibility**: All interactive elements must be touch-accessible
* **Screen Reader Support**: Use proper ARIA labels and semantic HTML
* **Reduced Motion**: Respect user preferences for reduced motion

## Specific Component Guidelines

### Buttons
* Use `whileTap={{ scale: 0.95 }}` for press feedback
* Minimum 44px × 44px touch target
* Clear visual hierarchy with proper color contrast

### Cards
* Always use glass morphism background system
* Consistent shadow and border system
* No hover effects - rely on visual design for affordance

### Navigation
* Touch-optimized button sizes
* Clear active states without hover dependency
* Smooth transitions between screens

### Forms
* Large, touch-friendly input fields
* Clear focus states for accessibility
* No hover-dependent functionality

Remember: This is a mobile learning app designed specifically for iPhone. Every design decision should prioritize touch interaction and mobile performance.