export type Deferred = {
  promise: Promise<any>;
  resolve: (value: any) => void;
  reject: (value: any) => void;
};

export const makeDeferred = () => {
  const deferred = {} as Deferred;
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
};
