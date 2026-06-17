pub type AppResult<T> = Result<T, String>;

pub trait IntoAppResult<T> {
    fn into_app_result(self) -> AppResult<T>;
}

impl<T, E> IntoAppResult<T> for Result<T, E>
where
    E: std::fmt::Display,
{
    fn into_app_result(self) -> AppResult<T> {
        self.map_err(|error| error.to_string())
    }
}
