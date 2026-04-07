import React, { createContext, useContext } from 'react';

const ReadOnlyContext = createContext<boolean>(false);

export const ReadOnlyProvider: React.FC<{ value: boolean; children: React.ReactNode }> = ({ value, children }) => (
  <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>
);

export const useReadOnly = () => useContext(ReadOnlyContext);
