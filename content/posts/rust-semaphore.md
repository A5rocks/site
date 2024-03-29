+++
title = "Recipe for a Rust semaphore"
date = 2021-09-19
updated = 2021-09-19
+++

Recently, I wanted a semaphore for Rust to limit the number of requests
at once to a thread-based server. Sadly, there is none in the standard
library, and so I have to write my own.

I could use a threadpool, but that imposes a constant 50 threads,
whereas my lazy system could burst to 50 requests but stay at only the
main thread when needing to.

```rust
use std::sync;

pub struct Semaphore {
    counter: sync::Mutex<usize>,
    condvar: sync::Condvar,
    limit: usize
}

pub struct SemaphoreGuard<'a> {
    semaphore: &'a Semaphore
}

impl Semaphore {
    pub fn start(&self) -> SemaphoreGuard<'_> {
        // wait for availability
        let mut count = self.counter.lock().unwrap();
        while *count >= self.limit {
            count = self.condvar.wait(count).unwrap();
        }

        *count += 1;
        SemaphoreGuard { semaphore: self }
    }

    fn decrement(&self) {
        *self.counter.lock().unwrap() -= 1;
        self.condvar.notify_all();
    }

    pub fn new(limit: usize) -> Self {
        Self {
            counter: sync::Mutex::new(0),
            condvar: sync::Condvar::new(),
            limit
        }
    }
}

impl Drop for SemaphoreGuard<'_> {
    fn drop(&mut self) {
        self.semaphore.decrement()
    }
}
```

This probably has bugs but, whatever. Also, it could probably be made
faster using atomics. But if a semaphore is your bottleneck, you can
probably figure those out.

Perhaps I'll post some analysis of the lines in the future, but I'm out
of motivation.
