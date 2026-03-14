# iPhone Frame PNG Export Setup

## ✅ Ready to Use! 

This export tool is fully compatible with your mobile learning app's design system and requires no additional packages!

## Usage Options

### Option 1: Temporary Export Route (Recommended)

1. **Add Export Route**: Add these lines at the very beginning of your App component in `/App.tsx`:

```tsx
// Add this import at the top with your other imports
import ExportPage from './ExportPage';

// Add this condition as the FIRST line in your App component function
export default function App() {
  // Add this check first, before any other code
  if (window.location.pathname === '/export') {
    return <ExportPage />;
  }
  
  // Mobile-first design with touch-optimized interactions
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  // ... rest of your existing App code continues unchanged
}
```

2. **Access Export**: Navigate to `/export` in your browser
3. **Export Your Frame**: Click "Export Instructions" for detailed steps
4. **Professional Results**: Get a perfect PNG template for your mockups

### Option 2: Direct Browser Export (No Route Setup)

1. **Open Your App**: Navigate to your learning app in browser
2. **Open DevTools**: Press F12 or right-click → Inspect
3. **Find Frame Element**: Locate the iPhone frame in the Elements panel
4. **Screenshot Node**: Right-click frame element → "Screenshot Node"
5. **Save PNG**: Browser automatically downloads the frame as PNG

### Option 3: Full Page Screenshot

1. **DevTools**: Press Ctrl+Shift+I (Windows) or Cmd+Opt+I (Mac)
2. **Command Menu**: Press Ctrl+Shift+P (Windows) or Cmd+Shift+P (Mac)
3. **Type**: "screenshot" and select "Capture full size screenshot"
4. **Crop**: Edit the image to isolate the phone frame

## Export Specifications

- **Dimensions**: 428×926px (iPhone 14 exact size)  
- **Browser Quality**: High-DPI automatic scaling
- **Format**: PNG with transparent background option
- **Quality**: Perfect for Figma, Sketch, Adobe XD, Photoshop
- **File Size**: ~30-80KB optimized

## Design Software Integration

### Figma
1. Import PNG as background image
2. Create component for reusability
3. Set up auto-layout constraints
4. Use as master template for mockups

### Sketch
1. Import at @3x resolution
2. Create symbol for reuse
3. Set up responsive resizing rules
4. Use in artboard templates

### Adobe XD
1. Import as background asset
2. Create repeat grid template
3. Set up component states
4. Use in design system

## Pro Tips

- **Multiple Variants**: Export different frame colors by changing the gradient
- **Content Mockups**: Use the frame PNG as overlay for your designs
- **Batch Processing**: Create multiple device mockups using the same template
- **Quality**: Always use 3x export for crisp retina displays
- **Transparent Background**: Perfect for layering over any background

## Troubleshooting

- **Export Failed**: Try the browser screenshot method
- **Low Quality**: Ensure 3x scale setting is enabled
- **Wrong Size**: Check the viewport isn't zoomed
- **Missing Shadows**: Make sure all shadow layers are included