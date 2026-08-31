// Artillery Load Test Processor
// Custom processor for load testing scenarios

module.exports = {
  // Custom function to generate random user data
  generateUserData: function (context, events, done) {
    const userId = `user-${Math.floor(Math.random() * 1000)}`;
    const email = `test${Math.floor(Math.random() * 1000)}@example.com`;
    const name = `Test User ${Math.floor(Math.random() * 1000)}`;

    context.vars.userId = userId;
    context.vars.email = email;
    context.vars.name = name;

    return done();
  },

  // Custom function to add random delay
  randomDelay: function (context, events, done) {
    const delay = Math.random() * 2000; // 0-2 seconds
    setTimeout(() => {
      return done();
    }, delay);
  },

  // Custom function to validate response
  validateResponse: function (context, events, done) {
    const response = context.vars.response;

    if (response && response.statusCode === 200) {
      events.emit('counter', 'successful_requests', 1);
    } else {
      events.emit('counter', 'failed_requests', 1);
    }

    return done();
  },

  // Custom function to log test progress
  logProgress: function (context, events, done) {
    const userId = context.vars.userId || 'unknown';
    const timestamp = new Date().toISOString();

    console.log(`[${timestamp}] User ${userId} completed request`);

    return done();
  },
};
