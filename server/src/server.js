/**
 * Process entrypoint. `config/env.js` must be imported before anything that
 * reads process.env at module scope.
 */
import './config/env.js';

import app from './app.js';
import { env } from './config/env.js';
import { startPostScheduler } from './modules/scheduler/scheduler.service.js';

app.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);

    // Publishes due scheduled_posts to Facebook / Instagram
    startPostScheduler();
});
