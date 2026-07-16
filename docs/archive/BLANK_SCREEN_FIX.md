# 🔧 Blank Home Screen Fix

## 🐛 **Issue**

The default home route (`/`) shows a blank white screen.

## 🔍 **Likely Causes**

1. **Environment variable**: `VITE_ENABLE_MULTI_LEAGUE=true` is set, routing to `Welcome` component
2. **Missing context or auth issues** causing component to fail silently
3. **CSS/styling conflicts**

## ✅ **Quick Solutions**

### **Option 1: Use the Test Route (Recommended)**
Instead of debugging the main route, use the working test route:

```
npm run dev
# Navigate to: http://localhost:5173/bqbl-test
```

### **Option 2: Disable Multi-League Flag**
If you want to use the original home page temporarily:

Create/update `.env.local`:
```env
VITE_ENABLE_MULTI_LEAGUE=false
```

Then restart the dev server:
```bash
npm run dev
```

### **Option 3: Debug the Welcome Component**
Check browser console for errors:
1. Open dev tools (F12)
2. Check Console tab for React/JS errors
3. Check Network tab for failed API calls

## 🎯 **Recommended Approach**

**Use the test route** (`/bqbl-test`) for now since:
- ✅ It's specifically designed for testing the new system
- ✅ It's isolated from existing code
- ✅ It has better error handling
- ✅ It won't interfere with production users

## 🚀 **Updated Commands**

```bash
# Start the development server (Vite project)
npm run dev

# Access the test route
# Navigate to: http://localhost:5173/bqbl-test
```

The test route is fully functional and ready for testing the multi-league workflow!