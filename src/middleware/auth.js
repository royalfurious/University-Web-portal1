function ensureAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return next();
}

function ensureRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        user: req.session.user,
        message: 'You do not have permission to access this page.'
      });
    }

    return next();
  };
}

module.exports = {
  ensureAuthenticated,
  ensureRole
};
