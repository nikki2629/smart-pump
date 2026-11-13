module.exports = {
  preset: 'jest-expo',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  moduleNameMapper: {
    '^@/(api|auth|data|notifications|ui|utils)/(.*)$':
      '<rootDir>/src/$1/$2',
    '^@/(.*)$': '<rootDir>/$1',
  },
  clearMocks: true,
};
