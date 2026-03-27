import type { FC } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import type { Container } from './container';
import { AppRoot } from './lib/components/AppRoot';
import { ChatRenderer } from './lib/components/Chat/ChatRenderer';
import { ChatPreviewRenderer } from './lib/components/Chat/ChatPreviewRenderer';
import './agent/components/registerComponents';
import { observer } from 'mobx-react-lite';

export const App: FC<{ container: Container }> = observer(({ container }) => {
  return (
    <AppRoot container={container}>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/agent/:configurationId/:type" Component={ChatPreviewRenderer} />
          <Route path="/" Component={ChatRenderer} />
        </Routes>
      </BrowserRouter>
    </AppRoot>
  );
});
