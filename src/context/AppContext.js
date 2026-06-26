import React, { createContext, useState, useEffect, useContext } from 'react';
import { checkCurrentActivationStatus, getUniqueDeviceId } from '../utils/activation';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [isActivated, setIsActivated] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [isCheckingSecurity, setIsCheckingSecurity] = useState(true);

  // Function to refresh and check security status
  async function performSecurityCheck() {
    setIsCheckingSecurity(true);
    
    const currentId = await getUniqueDeviceId();
    setDeviceId(currentId);
    
    const activeState = await checkCurrentActivationStatus();
    setIsActivated(activeState);
    
    setIsCheckingSecurity(false);
  }

  useEffect(() => {
    performSecurityCheck();
  }, []);

  return (
    <AppContext.Provider value={{ 
      isActivated, 
      setIsActivated, 
      deviceId, 
      isCheckingSecurity, 
      performSecurityCheck 
    }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to quickly fetch safety info inside any screen component
export function useApp() {
  return useContext(AppContext);
}