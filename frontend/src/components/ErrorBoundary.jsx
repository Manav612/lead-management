import React from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'

/**
 * Catches render-time crashes so a broken page shows a readable error
 * instead of a blank white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Alert
            severity="error"
            sx={{ maxWidth: 560 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => { this.setState({ error: null }); window.location.reload() }}
              >
                Reload
              </Button>
            }
          >
            <strong>Something went wrong on this page.</strong>
            <br />
            {this.state.error?.message || 'Unexpected error'}
            {' — '}press Reload to continue.
          </Alert>
        </div>
      )
    }
    return this.props.children
  }
}
